import { prisma } from "../config/db.js";
import { AppError } from "../utils/AppError.js";
import { getDependentPatientIds } from "./access.service.js";
import { getIO } from "../sockets/index.js";
import { logger } from "../utils/logger.js";
import { cacheKeys, cached, delCached, delCachedByPrefix } from "../config/redis.js";

/**
 * Chat message cache.
 *
 * Only the **first page** of a thread is cached: it is what every open
 * conversation re-reads constantly, while older pages are scrolled to once.
 * The TTL is short and the whole thread's cache is dropped on every send, so a
 * reader can never see a stale conversation — the failure mode of a chat cache
 * is a missing message, which is worse than the query it saves.
 */
const MESSAGES_TTL_SECONDS = 60;
const THREADS_TTL_SECONDS = 30;

/**
 * The front desk and admin views listed every thread in the hospital with no
 * limit, which grows without bound. The list is a recent-activity view, so it
 * is capped and ordered by last message.
 */
const THREAD_LIST_LIMIT = 100;

/**
 * The two participants of a conversation, whichever way the thread was created.
 *
 * Every thread stores `patientId`/`doctorId` — appointment threads and direct
 * threads alike — so participation checks never branch on "which kind". The
 * appointment link is a fallback for rows created before the backfill, not a
 * separate access path.
 */
function participantOf(thread: {
  patientId: string | null;
  doctorId: string | null;
  appointment?: { patientId: string; doctorId: string } | null;
}): { patientId: string; doctorId: string } {
  return {
    patientId: thread.patientId ?? thread.appointment?.patientId ?? "",
    doctorId: thread.doctorId ?? thread.appointment?.doctorId ?? "",
  };
}

async function invalidateThreadCache(threadId: string): Promise<void> {
  await delCachedByPrefix(cacheKeys.chatMessagesPrefix(threadId));

  // The thread list shows last message and unread counts, so it is stale too.
  const thread = await prisma.chatThread.findUnique({
    where: { id: threadId },
    select: {
      patient: { select: { userId: true } },
      doctor: { select: { userId: true } },
      appointment: {
        select: {
          patient: { select: { userId: true } },
          doctor: { select: { userId: true } },
        },
      },
    },
  });
  if (!thread) return;

  const userIds = [
    thread.patient?.userId,
    thread.doctor?.userId,
    thread.appointment?.patient?.userId,
    thread.appointment?.doctor?.userId,
  ].filter((id): id is string => Boolean(id));

  if (userIds.length === 0) return;
  await delCached(...userIds.map((id) => cacheKeys.chatThreads(id)));
}

/**
 * Whether a user may take part in a conversation between a patient and a doctor.
 *
 * One resolver rather than the same boolean written at four call sites — that
 * duplication is precisely how one of them ends up not knowing about guardians, and a
 * parent finds they cannot message their child's doctor.
 */
async function canParticipate(
  userId: string,
  participant: { patientId: string; doctorId: string },
  mode: "read" | "write" = "read",
): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, patient: { select: { id: true } }, doctor: { select: { id: true } } },
  });
  if (!user) return false;

  if (user.role === "ADMIN") return true;
  // A receptionist may read a thread for front-desk context but must never post into
  // it — a message from the desk appearing in a clinical conversation reads to the
  // patient as coming from their doctor.
  if (user.role === "RECEPTIONIST") return mode === "read";
  if (user.role === "DOCTOR") return user.doctor?.id === participant.doctorId;

  if (user.role === "PATIENT" && user.patient) {
    if (user.patient.id === participant.patientId) return true;

    // A guardian speaks for their dependant. Gated on record access rather than
    // booking: this conversation is about the patient's care, not their calendar.
    const dependents = await getDependentPatientIds(user.patient.id, "records");
    return dependents.includes(participant.patientId);
  }

  return false;
}

export async function getThreads(userId: string) {
  return cached(cacheKeys.chatThreads(userId), THREADS_TTL_SECONDS, () => loadThreads(userId));
}

async function loadThreads(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, patient: { select: { id: true } }, doctor: { select: { id: true } } },
  });
  if (!user) throw new AppError("User not found", 404);

  // patientId/doctorId sit directly on the thread (direct or appointment
  // linked), so each role filters on its own side with no join through
  // appointments. Both participants' names are returned for the list UI.
  const include = {
    appointment: { select: { id: true, appointmentNo: true } },
    patient: { select: { id: true, userId: true, fullName: true } },
    doctor: { select: { id: true, userId: true, fullName: true } },
    messages: { orderBy: { sentAt: "desc" }, take: 1 },
  } as const;

  if (user.role === "PATIENT" && user.patient) {
    // Own threads plus those of dependants whose records they may see.
    const dependents = await getDependentPatientIds(user.patient.id, "records");
    return prisma.chatThread.findMany({
      where: { patientId: { in: [user.patient.id, ...dependents] } },
      include,
      orderBy: [{ lastMessageAt: "desc" }, { createdAt: "desc" }],
      take: THREAD_LIST_LIMIT,
    });
  }

  if (user.role === "DOCTOR" && user.doctor) {
    return prisma.chatThread.findMany({
      where: { doctorId: user.doctor.id },
      include,
      orderBy: [{ lastMessageAt: "desc" }, { createdAt: "desc" }],
      take: THREAD_LIST_LIMIT,
    });
  }

  if (user.role === "ADMIN" || user.role === "RECEPTIONIST") {
    return prisma.chatThread.findMany({
      include,
      orderBy: [{ lastMessageAt: "desc" }, { createdAt: "desc" }],
      take: THREAD_LIST_LIMIT,
    });
  }

  return [];
}

/**
 * Whether a user may read a thread. Returns a boolean rather than throwing so the
 * socket layer can refuse a room join quietly — thread ids are guessable, and an
 * unauthorised join must not leak another patient's conversation.
 */
export async function isThreadParticipant(threadId: string, userId: string): Promise<boolean> {
  const thread = await prisma.chatThread.findUnique({
    where: { id: threadId },
    select: {
      patientId: true,
      doctorId: true,
      appointment: { select: { patientId: true, doctorId: true } },
    },
  });
  if (!thread) return false;

  return canParticipate(userId, participantOf(thread));
}

export async function getMessages(threadId: string, userId: string, page: number, limit: number) {
  const thread = await prisma.chatThread.findUnique({
    where: { id: threadId },
    select: {
      patientId: true,
      doctorId: true,
      appointment: { select: { patientId: true, doctorId: true } },
    },
  });
  if (!thread) throw new AppError("Thread not found", 404);

  if (!(await canParticipate(userId, participantOf(thread)))) {
    throw new AppError("Not a participant of this thread", 403);
  }

  const load = async () => {
    const [data, total] = await Promise.all([
      prisma.chatMessage.findMany({
        where: { threadId },
        orderBy: { sentAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          sender: { select: { id: true, email: true, role: true, avatarUrl: true } },
        },
      }),
      prisma.chatMessage.count({ where: { threadId } }),
    ]);
    return { data: data.reverse(), total };
  };

  // Only the first page is hot enough to be worth caching; deeper pages are
  // scrolled to once and would just occupy memory.
  if (page !== 1) return load();

  // Participation is re-checked above on every call, so the cache is keyed on
  // the thread rather than the reader — it holds no authorisation decision.
  return cached(cacheKeys.chatMessages(threadId, page), MESSAGES_TTL_SECONDS, load);
}

export async function sendMessage(threadId: string, userId: string, content: string) {
  const thread = await prisma.chatThread.findUnique({
    where: { id: threadId },
    select: {
      patientId: true,
      doctorId: true,
      appointment: { select: { patientId: true, doctorId: true } },
    },
  });
  if (!thread) throw new AppError("Thread not found", 404);

  if (!(await canParticipate(userId, participantOf(thread), "write"))) {
    throw new AppError("Not a participant of this thread", 403);
  }

  const message = await prisma.chatMessage.create({
    data: { threadId, senderUserId: userId, content },
    include: {
      sender: { select: { id: true, email: true, role: true, avatarUrl: true } },
    },
  });

  /**
   * Broadcast to everyone already in the thread room.
   *
   * Without this the message reached the database and stopped there: the
   * recipient saw nothing until they reloaded, which is not a chat. Only sockets
   * that passed the `chat:join` participation check are in the room, so the
   * broadcast cannot reach a non-participant.
   *
   * Emission must never fail the send — the message is already committed, and
   * the recipient's next fetch will show it regardless.
   */
  try {
    getIO().of("/chat").to(`chat:${threadId}`).emit("chat:message", message);
  } catch (err) {
    logger.error({ err, threadId }, "Failed to broadcast chat message");
  }

  // Also nudge the recipient's notification socket so an unread badge updates
  // even when they do not have the thread open.
  try {
    const recipients = await threadRecipientUserIds(threadId, userId);
    const notifications = getIO().of("/notifications");
    for (const recipientId of recipients) {
      notifications.to(`user:${recipientId}`).emit("chat:unread", { threadId });
    }
  } catch (err) {
    logger.error({ err, threadId }, "Failed to notify chat recipients");
  }

  await prisma.chatThread.update({
    where: { id: threadId },
    data: { lastMessageAt: new Date() },
  });

  await invalidateThreadCache(threadId);

  return message;
}

/** The other participants' user ids — used for unread notifications. */
async function threadRecipientUserIds(threadId: string, senderUserId: string): Promise<string[]> {
  const thread = await prisma.chatThread.findUnique({
    where: { id: threadId },
    select: {
      patient: { select: { userId: true } },
      doctor: { select: { userId: true } },
      appointment: {
        select: {
          patient: { select: { userId: true } },
          doctor: { select: { userId: true } },
        },
      },
    },
  });
  if (!thread) return [];

  return [
    thread.patient?.userId,
    thread.doctor?.userId,
    thread.appointment?.patient?.userId,
    thread.appointment?.doctor?.userId,
  ].filter((id): id is string => Boolean(id) && id !== senderUserId);
}

export async function markThreadRead(threadId: string, userId: string) {
  const thread = await prisma.chatThread.findUnique({
    where: { id: threadId },
    select: {
      patientId: true,
      doctorId: true,
      appointment: { select: { patientId: true, doctorId: true } },
    },
  });
  if (!thread) throw new AppError("Thread not found", 404);

  // This loaded the thread but never checked participation, so any authenticated user
  // could mark any thread read — clearing the real recipient's unread badge for a
  // message they had not seen.
  if (!(await canParticipate(userId, participantOf(thread)))) {
    throw new AppError("Not a participant of this thread", 403);
  }

  await prisma.chatMessage.updateMany({
    where: {
      threadId,
      senderUserId: { not: userId },
      readAt: null,
    },
    data: { readAt: new Date() },
  });

  // Read receipts are part of the cached payload, so it is now stale.
  await invalidateThreadCache(threadId);

  // Tell the sender their message was read, without them polling for it.
  try {
    getIO().of("/chat").to(`chat:${threadId}`).emit("chat:read", { threadId, byUserId: userId });
  } catch (err) {
    logger.error({ err, threadId }, "Failed to broadcast read receipt");
  }
}

export async function createThreadForAppointment(appointmentId: string) {
  const existing = await prisma.chatThread.findUnique({
    where: { appointmentId },
  });
  if (existing) return existing;

  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    select: { patientId: true, doctorId: true },
  });
  if (!appointment) throw new AppError("Appointment not found", 404);

  return prisma.chatThread.create({
    data: {
      appointmentId,
      patientId: appointment.patientId,
      doctorId: appointment.doctorId,
    },
  });
}

/**
 * Find or create the direct patient↔doctor conversation behind a doctor card's
 * "Message" button. Only the patient's own profile may be the starting side; a
 * guardian messaging on behalf of a dependant uses their own profile's threads
 * (which already include dependant threads) or books an appointment instead.
 */
export async function createOrGetDirectThread(userId: string, doctorId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, patient: { select: { id: true } } },
  });
  if (!user) throw new AppError("User not found", 404);
  if (user.role !== "PATIENT" || !user.patient) {
    throw new AppError("Only patients can start a direct chat", 403);
  }

  const doctor = await prisma.doctor.findFirst({
    where: { id: doctorId, deletedAt: null, verificationStatus: "VERIFIED" },
    select: { id: true },
  });
  if (!doctor) throw new AppError("Doctor not found", 404);

  const existing = await prisma.chatThread.findFirst({
    where: { patientId: user.patient.id, doctorId },
  });
  if (existing) return existing;

  return prisma.chatThread.create({
    data: { patientId: user.patient.id, doctorId },
  });
}
