import { prisma } from "../config/db.js";
import { AppError } from "../utils/AppError.js";
import { getDependentPatientIds } from "./access.service.js";

/**
 * Whether a user may take part in the conversation attached to an appointment.
 *
 * One resolver rather than the same boolean written at four call sites — that
 * duplication is precisely how one of them ends up not knowing about guardians, and a
 * parent finds they cannot message their child's doctor.
 */
async function canParticipate(
  userId: string,
  appointment: { patientId: string; doctorId: string },
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
  if (user.role === "DOCTOR") return user.doctor?.id === appointment.doctorId;

  if (user.role === "PATIENT" && user.patient) {
    if (user.patient.id === appointment.patientId) return true;

    // A guardian speaks for their dependant. Gated on record access rather than
    // booking: this conversation is about the patient's care, not their calendar.
    const dependents = await getDependentPatientIds(user.patient.id, "records");
    return dependents.includes(appointment.patientId);
  }

  return false;
}

export async function getThreads(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, patient: { select: { id: true } }, doctor: { select: { id: true } } },
  });
  if (!user) throw new AppError("User not found", 404);

  if (user.role === "PATIENT" && user.patient) {
    // Own threads plus those of dependants whose records they may see.
    const dependents = await getDependentPatientIds(user.patient.id, "records");
    const appointments = await prisma.appointment.findMany({
      where: { patientId: { in: [user.patient.id, ...dependents] }, deletedAt: null },
      select: { id: true, chatThread: true },
    });
    const threadIds = appointments.filter((a) => a.chatThread).map((a) => a.chatThread!.id);
    return prisma.chatThread.findMany({
      where: { id: { in: threadIds } },
      include: {
        appointment: {
          select: {
            id: true,
            appointmentNo: true,
            doctor: { select: { user: { select: { id: true, email: true } } } },
          },
        },
        messages: { orderBy: { sentAt: "desc" }, take: 1 },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  if (user.role === "DOCTOR" && user.doctor) {
    return prisma.chatThread.findMany({
      where: { appointment: { doctorId: user.doctor.id, deletedAt: null } },
      include: {
        appointment: {
          select: {
            id: true,
            appointmentNo: true,
            patient: { select: { fullName: true } },
          },
        },
        messages: { orderBy: { sentAt: "desc" }, take: 1 },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  if (user.role === "ADMIN" || user.role === "RECEPTIONIST") {
    return prisma.chatThread.findMany({
      include: {
        appointment: {
          select: {
            id: true,
            appointmentNo: true,
            doctor: { select: { user: { select: { email: true } } } },
            patient: { select: { fullName: true } },
          },
        },
        messages: { orderBy: { sentAt: "desc" }, take: 1 },
      },
      orderBy: { createdAt: "desc" },
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
    include: { appointment: { select: { patientId: true, doctorId: true } } },
  });
  if (!thread) return false;

  return canParticipate(userId, thread.appointment);
}

export async function getMessages(threadId: string, userId: string, page: number, limit: number) {
  const thread = await prisma.chatThread.findUnique({
    where: { id: threadId },
    include: { appointment: { select: { patientId: true, doctorId: true } } },
  });
  if (!thread) throw new AppError("Thread not found", 404);

  if (!(await canParticipate(userId, thread.appointment))) {
    throw new AppError("Not a participant of this thread", 403);
  }

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
}

export async function sendMessage(threadId: string, userId: string, content: string) {
  const thread = await prisma.chatThread.findUnique({
    where: { id: threadId },
    include: { appointment: { select: { patientId: true, doctorId: true } } },
  });
  if (!thread) throw new AppError("Thread not found", 404);

  if (!(await canParticipate(userId, thread.appointment, "write"))) {
    throw new AppError("Not a participant of this thread", 403);
  }

  const message = await prisma.chatMessage.create({
    data: { threadId, senderUserId: userId, content },
    include: {
      sender: { select: { id: true, email: true, role: true, avatarUrl: true } },
    },
  });

  await prisma.chatThread.update({
    where: { id: threadId },
    data: { createdAt: new Date() },
  });

  return message;
}

export async function markThreadRead(threadId: string, userId: string) {
  const thread = await prisma.chatThread.findUnique({
    where: { id: threadId },
    include: { appointment: { select: { patientId: true, doctorId: true } } },
  });
  if (!thread) throw new AppError("Thread not found", 404);

  // This loaded the thread but never checked participation, so any authenticated user
  // could mark any thread read — clearing the real recipient's unread badge for a
  // message they had not seen.
  if (!(await canParticipate(userId, thread.appointment))) {
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
}

export async function createThreadForAppointment(appointmentId: string) {
  const existing = await prisma.chatThread.findUnique({
    where: { appointmentId },
  });
  if (existing) return existing;

  return prisma.chatThread.create({
    data: { appointmentId },
  });
}
