import { prisma } from "../config/db.js";
import { AppError } from "../utils/AppError.js";

export async function issueToken(data: {
  doctorId: string;
  patientId?: string;
  appointmentId?: string;
  date: Date;
}) {
  const dateStart = new Date(data.date);
  dateStart.setUTCHours(0, 0, 0, 0);
  const dateEnd = new Date(dateStart);
  dateEnd.setUTCHours(23, 59, 59, 999);

  const lastToken = await prisma.queueToken.findFirst({
    where: { doctorId: data.doctorId, date: { gte: dateStart, lte: dateEnd } },
    orderBy: { tokenNumber: "desc" },
    select: { tokenNumber: true },
  });

  const tokenNumber = (lastToken?.tokenNumber ?? 0) + 1;

  const token = await prisma.queueToken.create({
    data: {
      doctorId: data.doctorId,
      patientId: data.patientId ?? null,
      appointmentId: data.appointmentId ?? null,
      date: dateStart,
      tokenNumber,
      status: "waiting",
    },
  });

  return token;
}

export async function getQueueForDoctor(doctorId: string, date?: Date) {
  const queryDate = date || new Date();
  const dateStart = new Date(queryDate);
  dateStart.setUTCHours(0, 0, 0, 0);
  const dateEnd = new Date(dateStart);
  dateEnd.setUTCHours(23, 59, 59, 999);

  const tokens = await prisma.queueToken.findMany({
    where: {
      doctorId,
      date: { gte: dateStart, lte: dateEnd },
      status: { in: ["waiting", "called"] },
    },
    orderBy: { tokenNumber: "asc" },
  });

  if (tokens.length === 0) return tokens;

  const appointmentIds = tokens.filter((t) => t.appointmentId).map((t) => t.appointmentId!);
  const appointments =
    appointmentIds.length > 0
      ? await prisma.appointment.findMany({
          where: { id: { in: appointmentIds } },
          include: {
            patient: { select: { id: true, fullName: true, mrn: true } },
          },
        })
      : [];

  const appointmentMap = new Map(appointments.map((a) => [a.id, a]));

  return tokens.map((t) => ({
    ...t,
    appointment: t.appointmentId ? (appointmentMap.get(t.appointmentId) ?? null) : null,
  }));
}

export async function callNext(doctorId: string, date?: Date) {
  const queryDate = date || new Date();
  const dateStart = new Date(queryDate);
  dateStart.setUTCHours(0, 0, 0, 0);
  const dateEnd = new Date(dateStart);
  dateEnd.setUTCHours(23, 59, 59, 999);

  const nextToken = await prisma.queueToken.findFirst({
    where: {
      doctorId,
      date: { gte: dateStart, lte: dateEnd },
      status: "waiting",
    },
    orderBy: { tokenNumber: "asc" },
  });

  if (!nextToken) throw new AppError("No patients in queue", 404);

  return prisma.queueToken.update({
    where: { id: nextToken.id },
    data: { status: "called", calledAt: new Date() },
  });
}

export async function skipToken(tokenId: string, doctorId: string) {
  const token = await prisma.queueToken.findUnique({ where: { id: tokenId } });
  if (!token) throw new AppError("Token not found", 404);
  if (token.doctorId !== doctorId) throw new AppError("Not your queue", 403);
  if (token.status !== "waiting" && token.status !== "called") {
    throw new AppError("Token is not active", 400);
  }

  return prisma.queueToken.update({
    where: { id: tokenId },
    data: { status: "skipped" },
  });
}

export async function getPatientPosition(doctorId: string, date: string) {
  const dateStart = new Date(`${date}T00:00:00.000Z`);
  const dateEnd = new Date(`${date}T23:59:59.999Z`);

  const waitingTokens = await prisma.queueToken.findMany({
    where: {
      doctorId,
      date: { gte: dateStart, lte: dateEnd },
      status: "waiting",
    },
    orderBy: { tokenNumber: "asc" },
  });

  return waitingTokens.map((t, index) => ({
    tokenId: t.id,
    tokenNumber: t.tokenNumber,
    position: index + 1,
    status: t.status,
  }));
}
