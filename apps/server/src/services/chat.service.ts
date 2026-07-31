import { prisma } from "../config/db";
import { AppError } from "../utils/AppError";

export async function getThreads(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, patient: { select: { id: true } }, doctor: { select: { id: true } } },
  });
  if (!user) throw new AppError("User not found", 404);

  if (user.role === "PATIENT" && user.patient) {
    const appointments = await prisma.appointment.findMany({
      where: { patientId: user.patient.id, deletedAt: null },
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

export async function getMessages(threadId: string, userId: string, page: number, limit: number) {
  const thread = await prisma.chatThread.findUnique({
    where: { id: threadId },
    include: { appointment: { select: { patientId: true, doctorId: true } } },
  });
  if (!thread) throw new AppError("Thread not found", 404);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, patient: { select: { id: true } }, doctor: { select: { id: true } } },
  });
  if (!user) throw new AppError("User not found", 404);

  const isParticipant =
    user.role === "ADMIN" ||
    user.role === "RECEPTIONIST" ||
    (user.role === "PATIENT" && user.patient?.id === thread.appointment.patientId) ||
    (user.role === "DOCTOR" && user.doctor?.id === thread.appointment.doctorId);

  if (!isParticipant) throw new AppError("Not a participant of this thread", 403);

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

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, patient: { select: { id: true } }, doctor: { select: { id: true } } },
  });
  if (!user) throw new AppError("User not found", 404);

  const isParticipant =
    user.role === "ADMIN" ||
    (user.role === "PATIENT" && user.patient?.id === thread.appointment.patientId) ||
    (user.role === "DOCTOR" && user.doctor?.id === thread.appointment.doctorId);

  if (!isParticipant) throw new AppError("Not a participant of this thread", 403);

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
