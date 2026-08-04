import {
  AppointmentStatus,
  LabOrderStatus,
  ReferralStatus,
  ResultFlag,
  Prisma,
  PrismaClient,
} from "@prisma/client";
import bcrypt from "bcryptjs";
import crypto from "crypto";

// Bulk seeding through the pooled endpoint is slow (pgbouncer spawns a backend
// per transaction). Prefer the direct connection for seeding when it's available.
const prisma = new PrismaClient({
  datasources: {
    db: { url: process.env.DIRECT_URL ?? process.env.DATABASE_URL },
  },
});

const DEMO_PASSWORD = "demo1234";

type Role =
  "PATIENT" | "DOCTOR" | "RECEPTIONIST" | "PHARMACIST" | "LAB_TECHNICIAN" | "ACCOUNTANT" | "ADMIN";

interface SeedUser {
  email: string;
  role: Role;
  fullName: string;
  gender?: string;
  bloodGroup?: string;
  dateOfBirth?: string;
  city?: string;
  allergies?: { allergen: string; severity: "MILD" | "MODERATE" | "SEVERE"; reaction?: string }[];
  conditions?: { condition: string; notes?: string }[];
  deptSlug?: string;
  consultationFee?: number;
  consultationMins?: number;
  licenseNumber?: string;
  deskLocation?: string;
  canVerify?: boolean;
}

const seedUsers: SeedUser[] = [
  // ── Patients ────────────────────────────────────────────────────────
  {
    email: "alex@example.com",
    role: "PATIENT",
    fullName: "Alex Johnson",
    gender: "Male",
    bloodGroup: "O+",
    dateOfBirth: "1985-04-12",
    city: "New York",
    allergies: [{ allergen: "Penicillin", severity: "SEVERE", reaction: "Anaphylaxis" }],
    conditions: [{ condition: "Hypertension", notes: "Managed on lisinopril" }],
  },
  {
    email: "amina@example.com",
    role: "PATIENT",
    fullName: "Amina Khan",
    gender: "Female",
    bloodGroup: "A+",
    dateOfBirth: "1992-11-03",
    city: "Lahore",
    allergies: [{ allergen: "Sulfonamides", severity: "MODERATE", reaction: "Skin rash" }],
    conditions: [{ condition: "Type 2 Diabetes" }],
  },
  {
    email: "brian@example.com",
    role: "PATIENT",
    fullName: "Brian O'Connell",
    gender: "Male",
    bloodGroup: "B+",
    dateOfBirth: "1978-08-21",
    city: "Dublin",
    conditions: [{ condition: "Asthma", notes: "Uses salbutamol inhaler PRN" }],
  },
  {
    email: "carlos@example.com",
    role: "PATIENT",
    fullName: "Carlos Rivera",
    gender: "Male",
    bloodGroup: "AB+",
    dateOfBirth: "1965-02-14",
    city: "Madrid",
    allergies: [{ allergen: "Aspirin", severity: "MILD", reaction: "Hives" }],
    conditions: [
      { condition: "Coronary Artery Disease" },
      { condition: "Dyslipidemia", notes: "On atorvastatin" },
    ],
  },
  {
    email: "dina@example.com",
    role: "PATIENT",
    fullName: "Dina Patel",
    gender: "Female",
    bloodGroup: "O-",
    dateOfBirth: "1995-06-30",
    city: "Ahmedabad",
    conditions: [{ condition: "Hypothyroidism" }],
  },
  {
    email: "emily@example.com",
    role: "PATIENT",
    fullName: "Emily Watson",
    gender: "Female",
    bloodGroup: "A-",
    dateOfBirth: "2001-12-19",
    city: "London",
    allergies: [{ allergen: "Latex", severity: "MODERATE", reaction: "Contact dermatitis" }],
  },
  {
    email: "farah@example.com",
    role: "PATIENT",
    fullName: "Farah Ahmed",
    gender: "Female",
    bloodGroup: "B-",
    dateOfBirth: "1988-09-08",
    city: "Karachi",
    conditions: [{ condition: "Migraine" }, { condition: "Iron Deficiency Anemia" }],
  },
  {
    email: "george@example.com",
    role: "PATIENT",
    fullName: "George Bennett",
    gender: "Male",
    bloodGroup: "O+",
    dateOfBirth: "1959-03-25",
    city: "Manchester",
    conditions: [
      { condition: "Atrial Fibrillation", notes: "Anticoagulated" },
      { condition: "COPD" },
    ],
  },
  {
    email: "hina@example.com",
    role: "PATIENT",
    fullName: "Hina Shah",
    gender: "Female",
    bloodGroup: "AB-",
    dateOfBirth: "1998-07-11",
    city: "Mumbai",
    allergies: [{ allergen: "Penicillin", severity: "MODERATE", reaction: "Urticaria" }],
  },
  {
    email: "ivan@example.com",
    role: "PATIENT",
    fullName: "Ivan Petrov",
    gender: "Male",
    bloodGroup: "A+",
    dateOfBirth: "1982-05-17",
    city: "Moscow",
    conditions: [{ condition: "Gout" }],
  },
  {
    email: "jane@example.com",
    role: "PATIENT",
    fullName: "Jane Miller",
    gender: "Female",
    bloodGroup: "O+",
    dateOfBirth: "1970-01-09",
    city: "Chicago",
    conditions: [{ condition: "Osteoarthritis" }, { condition: "GERD", notes: "On omeprazole" }],
  },
  {
    email: "khalid@example.com",
    role: "PATIENT",
    fullName: "Khalid Hassan",
    gender: "Male",
    bloodGroup: "B+",
    dateOfBirth: "1991-10-27",
    city: "Dubai",
  },
  {
    email: "lucia@example.com",
    role: "PATIENT",
    fullName: "Lucia Gomez",
    gender: "Female",
    bloodGroup: "O-",
    dateOfBirth: "1987-03-04",
    city: "Mexico City",
    allergies: [{ allergen: "Codeine", severity: "MODERATE", reaction: "Nausea, drowsiness" }],
  },
  {
    email: "maryam@example.com",
    role: "PATIENT",
    fullName: "Maryam Qureshi",
    gender: "Female",
    bloodGroup: "A+",
    dateOfBirth: "1993-12-01",
    city: "Islamabad",
    conditions: [{ condition: "PCOS" }],
  },
  {
    email: "nathan@example.com",
    role: "PATIENT",
    fullName: "Nathan Cole",
    gender: "Male",
    bloodGroup: "AB+",
    dateOfBirth: "2004-05-22",
    city: "Sydney",
  },
  {
    email: "olivia@example.com",
    role: "PATIENT",
    fullName: "Olivia Turner",
    gender: "Female",
    bloodGroup: "B+",
    dateOfBirth: "1975-09-15",
    city: "Boston",
    conditions: [{ condition: "Rheumatoid Arthritis" }],
  },
  {
    email: "peter@example.com",
    role: "PATIENT",
    fullName: "Peter Novak",
    gender: "Male",
    bloodGroup: "O+",
    dateOfBirth: "1968-04-06",
    city: "Prague",
    conditions: [{ condition: "Chronic Kidney Disease Stage 3" }],
  },
  {
    email: "quinn@example.com",
    role: "PATIENT",
    fullName: "Quinn Sullivan",
    gender: "Other",
    bloodGroup: "A-",
    dateOfBirth: "1996-08-29",
    city: "Cork",
  },
  {
    email: "rahul@example.com",
    role: "PATIENT",
    fullName: "Rahul Sharma",
    gender: "Male",
    bloodGroup: "O+",
    dateOfBirth: "1984-02-18",
    city: "Delhi",
    conditions: [{ condition: "Hyperlipidemia" }],
  },
  {
    email: "sofia@example.com",
    role: "PATIENT",
    fullName: "Sofia Rossi",
    gender: "Female",
    bloodGroup: "AB+",
    dateOfBirth: "1999-06-07",
    city: "Rome",
  },
  {
    email: "tara@example.com",
    role: "PATIENT",
    fullName: "Tara Singh",
    gender: "Female",
    bloodGroup: "B-",
    dateOfBirth: "1962-11-23",
    city: "Amritsar",
    conditions: [{ condition: "Hypothyroidism" }],
  },
  {
    email: "umar@example.com",
    role: "PATIENT",
    fullName: "Umar Farooq",
    gender: "Male",
    bloodGroup: "A+",
    dateOfBirth: "1989-07-05",
    city: "Faisalabad",
    allergies: [{ allergen: "Peanuts", severity: "SEVERE", reaction: "Anaphylaxis" }],
  },
  {
    email: "victor@example.com",
    role: "PATIENT",
    fullName: "Victor Hugo",
    gender: "Male",
    bloodGroup: "O-",
    dateOfBirth: "1977-12-12",
    city: "Paris",
  },
  {
    email: "zara@example.com",
    role: "PATIENT",
    fullName: "Zara Malik",
    gender: "Female",
    bloodGroup: "O+",
    dateOfBirth: "2000-01-30",
    city: "Rawalpindi",
  },

  // ── Doctors ─────────────────────────────────────────────────────────
  {
    email: "sarah@medicore.com",
    role: "DOCTOR",
    fullName: "Dr. Sarah Chen",
    deptSlug: "cardiology",
    consultationFee: 150,
    consultationMins: 30,
    licenseNumber: "MD-1001",
  },
  {
    email: "david@medicore.com",
    role: "DOCTOR",
    fullName: "Dr. David Okafor",
    deptSlug: "pediatrics",
    consultationFee: 120,
    consultationMins: 30,
    licenseNumber: "MD-1002",
  },
  {
    email: "meera@medicore.com",
    role: "DOCTOR",
    fullName: "Dr. Meera Nair",
    deptSlug: "orthopedics",
    consultationFee: 140,
    consultationMins: 30,
    licenseNumber: "MD-1003",
  },
  {
    email: "rafael@medicore.com",
    role: "DOCTOR",
    fullName: "Dr. Rafael Souza",
    deptSlug: "neurology",
    consultationFee: 180,
    consultationMins: 45,
    licenseNumber: "MD-1004",
  },
  {
    email: "jason@medicore.com",
    role: "DOCTOR",
    fullName: "Dr. Jason Kim",
    deptSlug: "dermatology",
    consultationFee: 130,
    consultationMins: 30,
    licenseNumber: "MD-1005",
  },
  {
    email: "elena@medicore.com",
    role: "DOCTOR",
    fullName: "Dr. Elena Volkova",
    deptSlug: "ophthalmology",
    consultationFee: 125,
    consultationMins: 30,
    licenseNumber: "MD-1006",
  },
  {
    email: "ahmed@medicore.com",
    role: "DOCTOR",
    fullName: "Dr. Ahmed Al-Farsi",
    deptSlug: "general-medicine",
    consultationFee: 110,
    consultationMins: 30,
    licenseNumber: "MD-1007",
  },
  {
    email: "priya@medicore.com",
    role: "DOCTOR",
    fullName: "Dr. Priya Iyer",
    deptSlug: "gynecology",
    consultationFee: 160,
    consultationMins: 30,
    licenseNumber: "MD-1008",
  },
  {
    email: "omar@medicore.com",
    role: "DOCTOR",
    fullName: "Dr. Omar Haddad",
    deptSlug: "psychiatry",
    consultationFee: 170,
    consultationMins: 45,
    licenseNumber: "MD-1009",
  },

  // ── Receptionists ───────────────────────────────────────────────────
  {
    email: "reception@medicore.com",
    role: "RECEPTIONIST",
    fullName: "Emma Wilson",
    deskLocation: "Front Desk A",
  },
  {
    email: "natalie@medicore.com",
    role: "RECEPTIONIST",
    fullName: "Natalie Reyes",
    deskLocation: "Front Desk B",
  },
  {
    email: "sam@medicore.com",
    role: "RECEPTIONIST",
    fullName: "Sam Okafor",
    deskLocation: "Front Desk C",
  },

  // ── Pharmacists ─────────────────────────────────────────────────────
  {
    email: "tom@medicore.com",
    role: "PHARMACIST",
    fullName: "Tom Martinez",
    licenseNumber: "PH-12345",
  },
  {
    email: "grace@medicore.com",
    role: "PHARMACIST",
    fullName: "Grace Lin",
    licenseNumber: "PH-22345",
  },
  {
    email: "hannah@medicore.com",
    role: "PHARMACIST",
    fullName: "Hannah Bauer",
    licenseNumber: "PH-32345",
  },

  // ── Lab Technicians ─────────────────────────────────────────────────
  {
    email: "lab@medicore.com",
    role: "LAB_TECHNICIAN",
    fullName: "James Brown",
    licenseNumber: "LT-67890",
    canVerify: true,
  },
  {
    email: "peter_lab@medicore.com",
    role: "LAB_TECHNICIAN",
    fullName: "Peter Chen",
    licenseNumber: "LT-77890",
    canVerify: true,
  },
  {
    email: "maria@medicore.com",
    role: "LAB_TECHNICIAN",
    fullName: "Maria Garcia",
    licenseNumber: "LT-87890",
    canVerify: false,
  },

  // ── Accountants ─────────────────────────────────────────────────────
  {
    email: "linda@medicore.com",
    role: "ACCOUNTANT",
    fullName: "Linda Davis",
  },
  {
    email: "robert@medicore.com",
    role: "ACCOUNTANT",
    fullName: "Robert Wilson",
  },

  // ── Admin ───────────────────────────────────────────────────────────
  {
    email: "mark@medicore.com",
    role: "ADMIN",
    fullName: "Mark Thompson",
  },
];

function daysAgo(n: number, hour = 9, minute = 0): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, minute, 0, 0);
  return d;
}

function randInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function generateMrn(): string {
  return `MRN-${String(Math.floor(10000 + Math.random() * 90000))}`;
}

async function main() {
  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);

  // ── Departments ──────────────────────────────────────────────────────
  const departments = [
    { name: "Cardiology", slug: "cardiology", description: "Heart and cardiovascular system" },
    {
      name: "Pediatrics",
      slug: "pediatrics",
      description: "Medical care for infants, children, and adolescents",
    },
    { name: "Orthopedics", slug: "orthopedics", description: "Musculoskeletal system" },
    { name: "Neurology", slug: "neurology", description: "Nervous system disorders" },
    { name: "Dermatology", slug: "dermatology", description: "Skin, hair, and nails" },
    { name: "Ophthalmology", slug: "ophthalmology", description: "Eye and vision care" },
    { name: "ENT", slug: "ent", description: "Ear, nose, and throat" },
    { name: "Gynecology", slug: "gynecology", description: "Female reproductive health" },
    { name: "Psychiatry", slug: "psychiatry", description: "Mental health" },
    { name: "Emergency", slug: "emergency", description: "Emergency medicine" },
    {
      name: "General Medicine",
      slug: "general-medicine",
      description: "Internal medicine and primary care",
    },
    { name: "Radiology", slug: "radiology", description: "Medical imaging and diagnostics" },
  ];

  for (const dept of departments) {
    await prisma.department.upsert({
      where: { slug: dept.slug },
      update: {},
      create: dept,
    });
  }
  const deptBySlug = new Map((await prisma.department.findMany()).map((d) => [d.slug, d]));

  // ── Hospital Settings ───────────────────────────────────────────────
  await prisma.hospitalSettings.upsert({
    where: { id: "singleton" },
    update: {},
    create: {
      id: "singleton",
      name: "HealVista Hospital",
      addressLine1: "123 Healthcare Avenue",
      city: "New York",
      country: "US",
      timezone: "America/New_York",
      currency: "USD",
      taxPercentage: 8,
      workingHoursStart: "08:00",
      workingHoursEnd: "20:00",
    },
  });

  // ── Users + role profiles ──────────────────────────────────────────
  const patients: { id: string; userId: string; fullName: string; user: SeedUser }[] = [];
  const doctors: { id: string; userId: string; fullName: string }[] = [];
  const usersByEmail = new Map<string, { id: string; role: Role }>();
  const labTechUserIds: string[] = [];
  const accountantUserIds: string[] = [];
  let adminUserId: string | undefined;

  for (const u of seedUsers) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: {
        email: u.email,
        passwordHash: hash,
        role: u.role,
        emailVerifiedAt: new Date(),
        isActive: true,
      },
    });
    usersByEmail.set(u.email, { id: user.id, role: u.role });

    switch (u.role) {
      case "PATIENT": {
        const patient = await prisma.patient.upsert({
          where: { userId: user.id },
          update: {},
          create: {
            userId: user.id,
            mrn: generateMrn(),
            fullName: u.fullName,
            gender: u.gender,
            bloodGroup: u.bloodGroup,
            dateOfBirth: u.dateOfBirth ? new Date(u.dateOfBirth) : undefined,
            city: u.city,
          },
        });
        patients.push({ id: patient.id, userId: user.id, fullName: u.fullName, user: u });
        break;
      }
      case "DOCTOR": {
        const doctor = await prisma.doctor.upsert({
          where: { userId: user.id },
          update: {},
          create: {
            userId: user.id,
            fullName: u.fullName,
            licenseNumber: u.licenseNumber,
            consultationFee: u.consultationFee ?? 150,
            consultationMins: u.consultationMins ?? 30,
            verificationStatus: "VERIFIED",
            qualifications: ["MD", "Board Certified"],
            languages: ["English"],
          },
        });
        doctors.push({ id: doctor.id, userId: user.id, fullName: u.fullName });
        break;
      }
      case "RECEPTIONIST":
        await prisma.receptionist.upsert({
          where: { userId: user.id },
          update: {},
          create: { userId: user.id, fullName: u.fullName, deskLocation: u.deskLocation },
        });
        break;
      case "PHARMACIST":
        await prisma.pharmacist.upsert({
          where: { userId: user.id },
          update: {},
          create: { userId: user.id, fullName: u.fullName, licenseNo: u.licenseNumber },
        });
        break;
      case "LAB_TECHNICIAN":
        await prisma.labTechnician.upsert({
          where: { userId: user.id },
          update: {},
          create: {
            userId: user.id,
            fullName: u.fullName,
            licenseNo: u.licenseNumber,
            canVerify: u.canVerify ?? false,
          },
        });
        labTechUserIds.push(user.id);
        break;
      case "ACCOUNTANT":
        await prisma.accountant.upsert({
          where: { userId: user.id },
          update: {},
          create: { userId: user.id, fullName: u.fullName },
        });
        accountantUserIds.push(user.id);
        break;
      case "ADMIN":
        adminUserId = user.id;
        break;
    }
  }

  // ── Doctor departments + availability ──────────────────────────────
  const doctorDeptMap = new Map<string, string>();
  for (const u of seedUsers.filter((s) => s.role === "DOCTOR")) {
    const user = usersByEmail.get(u.email)!;
    const doctor = doctors.find((d) => d.userId === user.id)!;
    const dept = u.deptSlug ? deptBySlug.get(u.deptSlug) : undefined;
    if (dept) {
      await prisma.doctorDepartment.upsert({
        where: { doctorId_departmentId: { doctorId: doctor.id, departmentId: dept.id } },
        update: {},
        create: { doctorId: doctor.id, departmentId: dept.id, isPrimary: true },
      });
      doctorDeptMap.set(doctor.id, dept.id);
    }
    for (let day = 1; day <= 5; day++) {
      await prisma.doctorAvailability.upsert({
        where: {
          doctorId_dayOfWeek_startTime: { doctorId: doctor.id, dayOfWeek: day, startTime: "09:00" },
        },
        update: {},
        create: {
          doctorId: doctor.id,
          dayOfWeek: day,
          startTime: "09:00",
          endTime: "17:00",
          slotDurationMins: u.consultationMins ?? 30,
          isActive: true,
        },
      });
    }
  }

  // ── Lab Tests Catalog ──────────────────────────────────────────────
  const labTests = [
    {
      name: "Complete Blood Count",
      code: "CBC",
      category: "Hematology",
      sampleType: "Blood",
      price: 35,
      turnaroundHours: 24,
    },
    {
      name: "Basic Metabolic Panel",
      code: "BMP",
      category: "Chemistry",
      sampleType: "Blood",
      price: 50,
      turnaroundHours: 24,
    },
    {
      name: "Comprehensive Metabolic Panel",
      code: "CMP",
      category: "Chemistry",
      sampleType: "Blood",
      price: 65,
      turnaroundHours: 24,
    },
    {
      name: "Lipid Panel",
      code: "LIPID",
      category: "Chemistry",
      sampleType: "Blood",
      price: 45,
      turnaroundHours: 24,
    },
    {
      name: "Thyroid Stimulating Hormone",
      code: "TSH",
      category: "Endocrinology",
      sampleType: "Blood",
      price: 55,
      turnaroundHours: 48,
    },
    {
      name: "Hemoglobin A1C",
      code: "HBA1C",
      category: "Endocrinology",
      sampleType: "Blood",
      price: 40,
      turnaroundHours: 24,
    },
    {
      name: "Urinalysis",
      code: "UA",
      category: "Urinalysis",
      sampleType: "Urine",
      price: 25,
      turnaroundHours: 24,
    },
    {
      name: "Chest X-Ray",
      code: "CXR",
      category: "Radiology",
      sampleType: "X-Ray",
      price: 120,
      turnaroundHours: 2,
    },
    {
      name: "COVID-19 PCR",
      code: "COVID-PCR",
      category: "Infectious Disease",
      sampleType: "Nasal Swab",
      price: 100,
      turnaroundHours: 24,
    },
    {
      name: "Liver Function Test",
      code: "LFT",
      category: "Chemistry",
      sampleType: "Blood",
      price: 45,
      turnaroundHours: 24,
    },
  ];

  for (const test of labTests) {
    await prisma.labTest.upsert({
      where: { code: test.code },
      update: {},
      create: test,
    });
  }
  const labTestByCode = new Map((await prisma.labTest.findMany()).map((t) => [t.code, t]));

  // ── Medicines Catalog ──────────────────────────────────────────────
  const medicines = [
    {
      name: "Amoxicillin",
      genericName: "Amoxicillin",
      unit: "mg",
      unitPrice: 0.15,
      category: "Antibiotic",
    },
    {
      name: "Azithromycin",
      genericName: "Azithromycin",
      unit: "mg",
      unitPrice: 0.5,
      category: "Antibiotic",
    },
    {
      name: "Metformin",
      genericName: "Metformin HCl",
      unit: "mg",
      unitPrice: 0.08,
      category: "Antidiabetic",
    },
    {
      name: "Atorvastatin",
      genericName: "Atorvastatin Calcium",
      unit: "mg",
      unitPrice: 0.12,
      category: "Cholesterol",
    },
    {
      name: "Lisinopril",
      genericName: "Lisinopril",
      unit: "mg",
      unitPrice: 0.1,
      category: "ACE Inhibitor",
    },
    { name: "Omeprazole", genericName: "Omeprazole", unit: "mg", unitPrice: 0.15, category: "PPI" },
    { name: "Ibuprofen", genericName: "Ibuprofen", unit: "mg", unitPrice: 0.05, category: "NSAID" },
    {
      name: "Paracetamol",
      genericName: "Acetaminophen",
      unit: "mg",
      unitPrice: 0.03,
      category: "Analgesic",
    },
    {
      name: "Amlodipine",
      genericName: "Amlodipine Besylate",
      unit: "mg",
      unitPrice: 0.11,
      category: "Calcium Channel Blocker",
    },
    {
      name: "Salbutamol Inhaler",
      genericName: "Albuterol Sulfate",
      unit: "mcg",
      unitPrice: 3.5,
      category: "Bronchodilator",
    },
  ];

  for (const med of medicines) {
    await prisma.medicine.upsert({
      where: { name: med.name },
      update: {},
      create: med,
    });
  }
  const medicineByName = new Map((await prisma.medicine.findMany()).map((m) => [m.name, m]));

  // ── Inventory ──────────────────────────────────────────────────────
  // Without stock rows, every dispense fails with "no inventory record". Batch
  // numbers are seeded deliberately: batch recall traces a batch through the
  // dispensing ledger, so there has to be one to trace.
  const stockLevels: Record<
    string,
    { quantity: number; reorderLevel: number; batchNumber: string }
  > = {
    Amoxicillin: { quantity: 500, reorderLevel: 100, batchNumber: "AMX-2026-A" },
    Azithromycin: { quantity: 220, reorderLevel: 50, batchNumber: "AZI-2026-A" },
    Metformin: { quantity: 800, reorderLevel: 150, batchNumber: "MET-2026-A" },
    Atorvastatin: { quantity: 640, reorderLevel: 120, batchNumber: "ATV-2026-A" },
    Lisinopril: { quantity: 410, reorderLevel: 100, batchNumber: "LIS-2026-A" },
    Omeprazole: { quantity: 300, reorderLevel: 80, batchNumber: "OMP-2026-A" },
    Ibuprofen: { quantity: 950, reorderLevel: 200, batchNumber: "IBU-2026-A" },
    Paracetamol: { quantity: 1200, reorderLevel: 250, batchNumber: "PCM-2026-A" },
    // Deliberately below its reorder level so the low-stock alert has something to
    // fire on without anyone having to run stock down by hand first.
    Amlodipine: { quantity: 40, reorderLevel: 90, batchNumber: "AML-2026-A" },
    "Salbutamol Inhaler": { quantity: 75, reorderLevel: 25, batchNumber: "SAL-2026-A" },
  };

  const expiry = new Date();
  expiry.setFullYear(expiry.getFullYear() + 1);

  for (const [name, stock] of Object.entries(stockLevels)) {
    const medicine = medicineByName.get(name);
    if (!medicine) continue;
    await prisma.inventory.upsert({
      where: { medicineId: medicine.id },
      update: {},
      create: {
        medicineId: medicine.id,
        quantity: stock.quantity,
        reorderLevel: stock.reorderLevel,
        batchNumber: stock.batchNumber,
        expiryDate: expiry,
      },
    });
  }

  // ── Drug Interactions ──────────────────────────────────────────────
  //
  // PROVENANCE — read this before extending the table.
  //
  // These pairs are well-established, widely-documented interactions drawn from
  // standard prescribing references (BNF / FDA labelling). They are a **teaching and
  // demonstration set, not a clinical drug database.** A real deployment must replace
  // this table wholesale with a licensed, maintained interaction dataset
  // (First Databank, Multum, BNF, or equivalent) under that vendor's update schedule.
  //
  // What must never happen is this table being populated by a language model. An
  // absent row reads as "no interaction found", so a hallucinated or omitted entry is
  // indistinguishable from a clean check — the failure is silent and the patient
  // absorbs it. Every row here is deterministic, sourced, and human-entered, which is
  // why prescriptionSafety.service does a table lookup and has no AI in its path.
  const interactions = [
    {
      drugA: "amoxicillin",
      drugB: "warfarin",
      severity: "MODERATE" as const,
      description: "May increase bleeding risk; monitor INR",
    },
    {
      drugA: "lisinopril",
      drugB: "spironolactone",
      severity: "SEVERE" as const,
      description: "Risk of hyperkalemia; monitor potassium",
    },
    {
      drugA: "ibuprofen",
      drugB: "warfarin",
      severity: "SEVERE" as const,
      description: "Increased bleeding risk; avoid combination",
    },
    {
      drugA: "metformin",
      drugB: "iodinated contrast",
      severity: "MODERATE" as const,
      description: "Risk of lactic acidosis; withhold metformin before contrast",
    },
    {
      drugA: "omeprazole",
      drugB: "clopidogrel",
      severity: "MODERATE" as const,
      description: "Reduced clopidogrel efficacy via CYP2C19 inhibition",
    },
    {
      drugA: "atorvastatin",
      drugB: "clarithromycin",
      severity: "SEVERE" as const,
      description: "Markedly increased statin exposure; risk of rhabdomyolysis",
    },
    {
      drugA: "lisinopril",
      drugB: "ibuprofen",
      severity: "MODERATE" as const,
      description: "NSAIDs reduce antihypertensive effect and may impair renal function",
    },
    {
      drugA: "azithromycin",
      drugB: "amiodarone",
      severity: "SEVERE" as const,
      description: "Additive QT prolongation; risk of torsades de pointes",
    },
    {
      drugA: "metformin",
      drugB: "alcohol",
      severity: "MODERATE" as const,
      description: "Increased risk of lactic acidosis",
    },
    {
      drugA: "amlodipine",
      drugB: "simvastatin",
      severity: "MODERATE" as const,
      description: "Increased simvastatin exposure; limit simvastatin dose",
    },
    {
      drugA: "warfarin",
      drugB: "paracetamol",
      severity: "MILD" as const,
      description: "Prolonged high-dose use may potentiate anticoagulation; monitor INR",
    },
    {
      drugA: "omeprazole",
      drugB: "methotrexate",
      severity: "MODERATE" as const,
      description: "Delayed methotrexate elimination; risk of toxicity",
    },
  ];

  for (const interaction of interactions) {
    const [a, b] = [interaction.drugA, interaction.drugB].sort();
    await prisma.drugInteraction.upsert({
      where: { drugA_drugB: { drugA: a, drugB: b } },
      update: {},
      create: {
        drugA: a,
        drugB: b,
        severity: interaction.severity,
        description: interaction.description,
      },
    });
  }

  // ── Patient clinical background (allergies, conditions) ────────────
  // Guarded so re-running the seed never duplicates these.
  if ((await prisma.patientAllergy.count()) === 0) {
    for (const p of patients) {
      for (const allergy of p.user.allergies ?? []) {
        await prisma.patientAllergy.create({
          data: {
            patientId: p.id,
            allergen: allergy.allergen,
            severity: allergy.severity,
            reaction: allergy.reaction,
            confirmedAt: new Date(),
          },
        });
      }
      for (const condition of p.user.conditions ?? []) {
        await prisma.patientCondition.create({
          data: {
            patientId: p.id,
            condition: condition.condition,
            notes: condition.notes,
            diagnosedAt: daysAgo(randInt(200, 1200)),
            isActive: true,
          },
        });
      }
    }
  }

  // ── KB articles ─────────────────────────────────────────────────────
  if ((await prisma.kbArticle.count()) === 0) {
    const kbArticles: {
      title: string;
      slug: string;
      content: string;
      category: string;
      deptSlug?: string;
    }[] = [
      {
        title: "Hospital Visiting Hours",
        slug: "visiting-hours",
        category: "Policy",
        content:
          "General ward visiting hours run from 10:00 to 12:00 and 16:00 to 20:00. ICU visiting is limited to 15 minutes and requires a prior appointment with the nursing desk. Children under 12 are not permitted in ICU. Food and flowers are not allowed in sterile units.",
      },
      {
        title: "Emergency Department Triage Policy",
        slug: "ed-triage-policy",
        category: "Policy",
        deptSlug: "emergency",
        content:
          "All patients presenting to the Emergency Department are triaged using a five-level acuity scale. Level 1 (resuscitation) patients are seen immediately. Level 5 (non-urgent) patients may be directed to outpatient services. Triage decisions are made by trained emergency nurses and reviewed by the attending physician.",
      },
      {
        title: "Prescribing Controlled Substances",
        slug: "controlled-substances",
        category: "Guideline",
        content:
          "Controlled substance prescriptions require a valid DEA number, written quantities in both words and numerals, and a diagnosis code. Refills are not permitted for Schedule II drugs. Prescriptions must be stored in the controlled medication safe and logged in the CDS register on dispense.",
      },
      {
        title: "Hand Hygiene Protocol",
        slug: "hand-hygiene",
        category: "Guideline",
        content:
          "Five moments of hand hygiene: before touching a patient, before a clean or aseptic procedure, after body fluid exposure risk, after touching a patient, and after touching patient surroundings. Alcohol-based hand rub is the standard; soap and water is required for Clostridioides difficile and norovirus.",
      },
      {
        title: "Patient Transfer Between Wards",
        slug: "patient-transfer",
        category: "Procedure",
        content:
          "Ward transfers require a completed transfer form, updated medication reconciliation, and a verbal handover to the receiving nurse. The receiving ward must confirm bed availability before transfer. Transport is via the porter service; critical patients travel with clinical escort.",
      },
      {
        title: "Lab Sample Labelling Requirements",
        slug: "lab-sample-labelling",
        category: "Procedure",
        deptSlug: "radiology",
        content:
          "Every specimen must be labelled at the bedside with patient name, MRN, collection date and time, and the collector's initials. Two identifiers are required. Unlabelled specimens are rejected and recollected. Correct collection tubes must match the requested panel (EDTA for CBC, SST for chemistry).",
      },
      {
        title: "Amoxicillin Allergy: What Staff Should Know",
        slug: "amoxicillin-allergy",
        category: "FAQ",
        content:
          "A penicillin allergy label affects antibiotic choice. Before prescribing a beta-lactam to a patient with a reported penicillin allergy, confirm the reaction type and severity in the allergy record. Severe reactions (anaphylaxis, angioedema) contraindicate all penicillins. Mild rashes may allow alternative beta-lactams after review.",
      },
      {
        title: "Billing and Insurance Verification",
        slug: "billing-insurance",
        category: "Policy",
        deptSlug: "general-medicine",
        content:
          "Insurance eligibility must be verified before elective admissions and outpatient procedures. Front desk staff confirm coverage, co-pay, and prior-authorisation requirements at registration. Uninsured patients receive a written estimate before non-emergency services. Charity care applications are available at the billing office.",
      },
    ];

    for (const a of kbArticles) {
      const dept = a.deptSlug ? deptBySlug.get(a.deptSlug) : undefined;
      await prisma.kbArticle.create({
        data: {
          title: a.title,
          slug: a.slug,
          content: a.content,
          category: a.category,
          departmentId: dept?.id,
          isPublished: true,
        },
      });
    }
  }

  // ── Clinical demo data: appointments, notes, prescriptions, labs, records ──
  // This is what feeds the RAG / semantic-search layer. Every item is keyed on a
  // deterministic identifier, so re-running the seed (or continuing a previously
  // interrupted run) tops the data up to the full set instead of duplicating it.
  if (patients.length > 0 && doctors.length > 0) {
    const noteTemplates = [
      {
        subjective:
          "Patient reports intermittent chest tightness on exertion for the past three weeks. Discomfort resolves with rest. No radiation to the arm or jaw. Denies palpitations, syncope, or orthopnea.",
        objective:
          "BP 142/88, HR 78, regular. BMI 27.4. Cardiovascular exam unremarkable. No peripheral oedema. ECG shows sinus rhythm with non-specific ST changes.",
        assessment: "Angina-like chest pain; rule out coronary artery disease. Hypertension.",
        plan: "Started amlodipine 5 mg daily. Ordered lipid panel and stress test. Follow up in 2 weeks.",
        diagnosisCodes: ["I20.9", "I10"],
      },
      {
        subjective:
          "Mother reports a two-day history of fever, dry cough, and reduced appetite. Child has been drinking less than usual. No vomiting or diarrhoea.",
        objective:
          "Temp 38.6C, HR 118, RR 24. Mild pharyngeal erythema. Chest clear. Hydration status adequate.",
        assessment: "Viral upper respiratory tract infection; watch for dehydration.",
        plan: "Supportive care, paracetamol for fever, adequate fluids. Review if symptoms worsen or persist beyond 5 days.",
        diagnosisCodes: ["J06.9"],
      },
      {
        subjective:
          "Complaints of right knee pain and swelling after a fall playing football. Pain worsens on weight-bearing. Unable to fully extend the knee.",
        objective:
          "Right knee effusion, tenderness along the medial joint line. ROM 10-110 degrees, painful at extremes. Negative Lachman test. Neurovascularly intact.",
        assessment: "Suspected medial meniscus injury, rule out ligamentous damage.",
        plan: "Cryotherapy, compression bandage, crutches with partial weight-bearing. MRI ordered. Review results in 1 week.",
        diagnosisCodes: ["S83.2"],
      },
      {
        subjective:
          "Reports recurrent headaches over the past month, described as a tight band around the head. Worse in the afternoon. No photophobia or vomiting. Stress at work.",
        objective:
          "Normal neurological examination. BP 128/76. Full neck range of motion. No focal deficits.",
        assessment: "Tension-type headache.",
        plan: "Stress management, regular sleep, paracetamol PRN. Review in 4 weeks if not improving.",
        diagnosisCodes: ["G44.2"],
      },
      {
        subjective:
          "New-onset itchy scaly plaques on the elbows and knees over the last two weeks. Occasional joint stiffness in the morning.",
        objective:
          "Well-demarcated erythematous plaques with silvery scales on both elbows and knees. Nail pitting present. Limited joint tenderness.",
        assessment: "Plaque psoriasis.",
        plan: "Topical corticosteroid twice daily for 4 weeks. Referral to rheumatology for joint symptoms. Phototherapy if no response.",
        diagnosisCodes: ["L40.0"],
      },
      {
        subjective:
          "Blurred vision in the right eye for one week. Feels like looking through a smudged lens. No pain, redness, or headache.",
        objective:
          "Visual acuity right 6/12, left 6/6. Slit lamp shows early cataract changes in the right lens. Fundoscopy clear.",
        assessment: "Early senile cataract, right eye.",
        plan: "Monitor. Cataract surgery discussion if vision interferes with daily life. Review in 6 months.",
        diagnosisCodes: ["H25.9"],
      },
      {
        subjective:
          "Presents with fatigue, increased thirst, and frequent urination over the past two months. No weight loss. Family history of diabetes.",
        objective:
          "BMI 31.2. BP 132/84. Fasting glucose 142 mg/dL. Review of records shows HbA1c elevated.",
        assessment: "Type 2 diabetes mellitus, newly suspected.",
        plan: "Started metformin 500 mg twice daily. Diabetes education, diet review. HbA1c and lipid panel ordered.",
        diagnosisCodes: ["E11.9"],
      },
      {
        subjective:
          "Patient reports worsening anxiety and difficulty sleeping over the past two months. Racing thoughts, irritability, and avoidance of social situations.",
        objective:
          "Appears anxious, fidgeting throughout. Speech normal. Mood low; affect congruent. No suicidal ideation. Cognitive function intact.",
        assessment: "Generalised anxiety disorder.",
        plan: "Psychoeducation, sleep hygiene. Consider CBT referral. Trial of sertraline 25 mg nightly, review in 4 weeks.",
        diagnosisCodes: ["F41.1"],
      },
    ];

    const labItemValues: Record<string, { resultValue: string; unit: string; flag: string }[]> = {
      CBC: [
        { resultValue: "13.8", unit: "g/dL", flag: "NORMAL" },
        { resultValue: "7.2", unit: "x10^9/L", flag: "NORMAL" },
        { resultValue: "245", unit: "x10^9/L", flag: "NORMAL" },
      ],
      BMP: [
        { resultValue: "96", unit: "mg/dL", flag: "NORMAL" },
        { resultValue: "1.0", unit: "mg/dL", flag: "NORMAL" },
        { resultValue: "138", unit: "mmol/L", flag: "NORMAL" },
      ],
      CMP: [
        { resultValue: "5.2", unit: "g/dL", flag: "NORMAL" },
        { resultValue: "1.1", unit: "mg/dL", flag: "NORMAL" },
        { resultValue: "14", unit: "U/L", flag: "NORMAL" },
      ],
      LIPID: [
        { resultValue: "198", unit: "mg/dL", flag: "HIGH" },
        { resultValue: "128", unit: "mg/dL", flag: "HIGH" },
        { resultValue: "38", unit: "mg/dL", flag: "LOW" },
      ],
      TSH: [{ resultValue: "2.6", unit: "mIU/L", flag: "NORMAL" }],
      HBA1C: [{ resultValue: "6.8", unit: "%", flag: "HIGH" }],
      UA: [
        { resultValue: "Negative", unit: "", flag: "NORMAL" },
        { resultValue: "None", unit: "", flag: "NORMAL" },
      ],
      LFT: [
        { resultValue: "28", unit: "U/L", flag: "NORMAL" },
        { resultValue: "24", unit: "U/L", flag: "NORMAL" },
        { resultValue: "0.9", unit: "mg/dL", flag: "NORMAL" },
      ],
      "COVID-PCR": [{ resultValue: "Negative", unit: "", flag: "NORMAL" }],
    };

    const medicinePool = [
      "Amoxicillin",
      "Metformin",
      "Atorvastatin",
      "Lisinopril",
      "Omeprazole",
      "Ibuprofen",
      "Paracetamol",
      "Salbutamol Inhaler",
      "Amlodipine",
      "Azithromycin",
    ];

    const appointments: { id: string; patientId: string; doctorId: string }[] = [];
    const appointmentCount = 30;
    const prescriptionCount = 25;
    const labOrderCount = 25;

    for (let i = 0; i < appointmentCount; i++) {
      const patient = patients[i % patients.length];
      const doctor = doctors[i % doctors.length];
      const isNoShow = i >= appointmentCount - 2;
      const start = daysAgo(3 + i * 2, 9 + (i % 6), 0);
      const end = new Date(start.getTime() + 30 * 60 * 1000);

      const slot = await prisma.appointmentSlot.upsert({
        where: { doctorId_startTime: { doctorId: doctor.id, startTime: start } },
        update: { endTime: end, isBooked: true },
        create: { doctorId: doctor.id, startTime: start, endTime: end, isBooked: true },
      });

      const apptData = {
        patientId: patient.id,
        doctorId: doctor.id,
        slotId: slot.id,
        departmentId: doctorDeptMap.get(doctor.id),
        status: (isNoShow ? "NO_SHOW" : "COMPLETED") as "NO_SHOW" | "COMPLETED",
        source: (i % 2 === 0 ? "ONLINE" : "WALK_IN") as "ONLINE" | "WALK_IN",
        reasonNote: noteTemplates[i % noteTemplates.length].subjective,
        checkedInAt: isNoShow ? start : new Date(start.getTime() - 15 * 60 * 1000),
        consultStartAt: isNoShow ? null : start,
        consultEndAt: isNoShow ? null : end,
      };
      const appointment = await prisma.appointment.upsert({
        where: { appointmentNo: `APT-${1000 + i}` },
        update: { ...apptData },
        create: {
          appointmentNo: `APT-${1000 + i}`,
          qrToken: crypto.randomBytes(12).toString("hex"),
          createdAt: new Date(start.getTime() - 24 * 60 * 60 * 1000),
          ...apptData,
        },
      });
      appointments.push({ id: appointment.id, patientId: patient.id, doctorId: doctor.id });

      if (isNoShow) continue;

      const template = noteTemplates[i % noteTemplates.length];
      await prisma.consultationNote.upsert({
        where: { appointmentId: appointment.id },
        update: {},
        create: {
          appointmentId: appointment.id,
          authorUserId: doctor.userId,
          subjective: template.subjective,
          objective: template.objective,
          assessment: template.assessment,
          plan: template.plan,
          diagnosisCodes: template.diagnosisCodes,
          isDraft: false,
          aiAssisted: false,
          signedAt: new Date(start.getTime() + 60 * 60 * 1000),
        },
      });

      if (i < prescriptionCount) {
        const first = medicinePool[i % medicinePool.length];
        const second = medicinePool[(i + 5) % medicinePool.length];
        const items = [
          { name: first, qty: randInt(10, 30) },
          { name: second, qty: randInt(10, 30) },
        ];
        await prisma.prescription.upsert({
          where: { appointmentId: appointment.id },
          update: { isDraft: false },
          create: {
            appointmentId: appointment.id,
            isDraft: false,
            notes: "Take as directed. Report any adverse reaction.",
            followUpAfterDays: 14,
            items: {
              create: items.map((item, idx) => ({
                medicineId: medicineByName.get(item.name)?.id,
                medicineName: item.name,
                dosage: idx === 0 ? "1 tab" : "1 tab",
                frequency: idx === 0 ? "Once daily" : "Twice daily",
                durationDays: 14,
                quantityPrescribed: item.qty,
                instructions: "With food",
              })),
            },
          },
        });
      }

      if (i < labOrderCount) {
        const testCodes = ["CBC", "BMP", "LIPID", "HBA1C", "TSH", "LFT", "UA", "COVID-PCR"];
        const code = testCodes[i % testCodes.length];
        const test = labTestByCode.get(code)!;
        await prisma.labOrder.upsert({
          where: { orderNumber: `LAB-SEED-${i}` },
          update: { status: "VERIFIED", notes: "Routine panel" },
          create: {
            orderNumber: `LAB-SEED-${i}`,
            appointmentId: appointment.id,
            patientId: patient.id,
            doctorId: doctor.id,
            status: "VERIFIED",
            orderedAt: start,
            sampleCollectedAt: new Date(start.getTime() + 20 * 60 * 1000),
            completedAt: new Date(start.getTime() + 2 * 60 * 60 * 1000),
            verifiedAt: new Date(start.getTime() + 3 * 60 * 60 * 1000),
            verifiedById: labTechUserIds[0],
            notes: "Routine panel",
            items: {
              create: (labItemValues[code] ?? []).map((v) => ({
                labTestId: test.id,
                resultValue: v.resultValue,
                unit: v.unit,
                referenceRange: test.referenceRange,
                flag: v.flag as any,
              })),
            },
          },
        });
      }
    }

    // Medical records with extracted text (embeddable).
    const recordTexts = [
      "Discharge summary: patient admitted with community-acquired pneumonia, treated with azithromycin 500 mg for 5 days. Improved, discharged home on day 4. Advised rest and follow-up chest X-ray in 6 weeks.",
      "History and physical: long-standing hypertension controlled on lisinopril 10 mg daily. Recent BP readings 128-135/82-88. No end-organ damage noted. Annual eye exam advised.",
      "Lab report summary: HbA1c 6.8% reflects suboptimal glycaemic control. Lipid profile shows elevated LDL 128 mg/dL. Dietary counselling reinforced; target LDL below 100.",
      "Consultation note: chronic knee pain with X-ray evidence of early osteoarthritis. Conservative management with weight loss, physiotherapy, and paracetamol PRN. Total knee replacement discussed as future option.",
      "Pre-op assessment: patient fit for cataract surgery under local anaesthesia. No anticoagulant use. Anaesthesia review completed. Surgery scheduled; nil by mouth after midnight.",
      "Follow-up: migraine frequency reduced from 4 to 1 episodes per month on propranolol. Continue current dose. Maintain headache diary. Review in 3 months.",
      "ER note: right ankle sprain after inversion injury. X-ray negative for fracture. Compression bandage applied, crutches for 5 days. Review in clinic if persistent pain.",
      "Annual wellness: vitals normal. Cancer screening up to date. BMI 24.1. All immunisations current. Health maintenance counselling provided.",
      "Inpatient progress: fever resolved, cultures negative, tolerating oral intake. IV antibiotics switched to oral. Plan discharge tomorrow with wound care instructions.",
      "Psychiatry assessment: generalised anxiety disorder. Started sertraline 25 mg. Sleep improved. Continue CBT sessions weekly. No safety concerns.",
      "Dermatology: plaque psoriasis improving on topical therapy. Mild residual scaling on elbows. Continue treatment; phototherapy referral placed.",
      "Diabetic foot screen: intact sensation, normal pedal pulses, no ulcers. Advised daily foot inspection and proper footwear. Refer to podiatry if any lesion.",
      "Prenatal visit 1: viable intrauterine pregnancy confirmed on ultrasound. Routine labs ordered. Folic acid supplementation. Next visit in 4 weeks.",
      "Cardiology review: stress test negative for ischaemia. Continue amlodipine and lifestyle measures. Lipid panel recheck in 3 months.",
      "Urology consult: uncomplicated urinary tract infection. Prescribed nitrofurantoin for 5 days. Culture sensitivities pending. Repeat urinalysis after treatment.",
    ];
    for (let i = 0; i < Math.min(15, patients.length); i++) {
      const patient = patients[i];
      const marker = `seed://record-${i}.txt`;
      const exists = await prisma.medicalRecord.findFirst({ where: { fileUrl: marker } });
      if (exists) continue;
      await prisma.medicalRecord.create({
        data: {
          patientId: patient.id,
          fileUrl: marker,
          fileType: "text/plain",
          title: recordTexts[i].split(":")[0],
          category: "Document",
          extractedText: recordTexts[i % recordTexts.length],
          uploadedById: doctors[i % doctors.length].userId,
          uploadedAt: daysAgo(randInt(5, 60)),
        },
      });
    }
  }

  // ── Bills + payments ─────────────────────────────────────────────────
  if (patients.length > 0 && accountantUserIds.length > 0) {
    const appointments = await prisma.appointment.findMany({
      where: { status: "COMPLETED" },
      orderBy: { createdAt: "asc" },
      take: 15,
    });

    for (let i = 0; i < appointments.length; i++) {
      const appt = appointments[i];
      const patient = await prisma.patient.findUnique({ where: { id: appt.patientId } });
      if (!patient) continue;

      const subtotal = 120 + (i % 4) * 50;
      const taxAmount = Math.round(subtotal * 0.08);
      const total = subtotal + taxAmount;
      const isPaid = i % 5 !== 1;
      const isPartial = i % 5 === 0;
      const amountPaid = isPaid ? (isPartial ? Math.round(total / 2) : total) : 0;
      const balance = total - amountPaid;

      const bill = await prisma.bill.upsert({
        where: { billNumber: `BL-SEED-${1000 + i}` },
        update: {
          patientId: patient.id,
          appointmentId: appt.id,
          subtotal,
          discountAmount: 0,
          taxAmount,
          insuranceCovered: 0,
          total,
          amountPaid,
          balance,
          status: isPaid ? (isPartial ? "partially_paid" : "paid") : "finalised",
          finalisedAt: daysAgo(10 + i),
        },
        create: {
          billNumber: `BL-SEED-${1000 + i}`,
          patientId: patient.id,
          appointmentId: appt.id,
          subtotal,
          discountAmount: 0,
          taxAmount,
          insuranceCovered: 0,
          total,
          amountPaid,
          balance,
          status: isPaid ? (isPartial ? "partially_paid" : "paid") : "finalised",
          finalisedAt: daysAgo(10 + i),
          items: {
            create: [
              {
                kind: "CONSULTATION",
                description: "Consultation fee",
                quantity: 1,
                unitPrice: subtotal,
                amount: subtotal,
              },
              {
                kind: "LAB",
                description: "Diagnostic panel",
                quantity: 1,
                unitPrice: taxAmount > 0 ? Math.round(taxAmount / 2) : 10,
                amount: taxAmount > 0 ? Math.round(taxAmount / 2) : 10,
              },
            ],
          },
        },
      });

      if (amountPaid > 0) {
        const existingPayment = await prisma.payment.findFirst({ where: { billId: bill.id } });
        if (!existingPayment) {
          await prisma.payment.create({
            data: {
              billId: bill.id,
              amount: amountPaid,
              method: i % 3 === 0 ? "CARD" : "CASH",
              status: "SUCCEEDED",
              provider: i % 3 === 0 ? "CARD" : null,
              providerRef: i % 3 === 0 ? `seed-card-${1000 + i}` : null,
              receivedById: accountantUserIds[i % accountantUserIds.length],
              reference: `TXN-${1000 + i}`,
            },
          });
        }
      }
    }
  }

  // ── Demo-day supplement ──────────────────────────────────────────────────
  // See seedDemoState() below — it seeds the live-day state (appointments today,
  // queue, pending lab/pharmacy work, chat, notifications, discounts, recalls,
  // dependants) every role's demo needs. Idempotent and relative to "today".
  const userEmailById = new Map<string, string>();
  for (const [email, u] of usersByEmail) userEmailById.set(u.id, email);
  const doctorByEmail = new Map<string, { id: string; userId: string; fullName: string }>();
  for (const d of doctors) {
    const email = userEmailById.get(d.userId);
    if (email) doctorByEmail.set(email, d);
  }

  await seedDemoState({
    patients,
    doctors,
    doctorByEmail,
    doctorDeptMap,
    medicineByName,
    labTestByCode,
    usersByEmail,
    labTechUserIds,
    accountantUserIds,
    receptionUserId: usersByEmail.get("reception@medicore.com")?.id,
    pharmacistUserId: usersByEmail.get("tom@medicore.com")?.id,
  });

  console.log(
    "Seed complete — demo users, departments, lab tests, medicines, inventory, drug interactions, clinical records, KB articles, bills.",
  );
  console.log(
    "Drug interactions are a demonstration set, not a clinical database — see the provenance note in seed.ts.",
  );
  console.log("All demo accounts password: demo1234");
  console.log("Run `npm run db:embed` to backfill pgvector embeddings for RAG / semantic search.");
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

/**
 * Demo-day supplement (idempotent).
 *
 * The base seed above fills history — past appointments, verified labs, settled
 * bills — but nothing that makes a *live* demo look alive: no appointments today,
 * an empty pharmacy queue, no pending lab work, no chat, no notifications, no
 * discounts. This section seeds the live-day state every role's dashboard and
 * primary flows expect, keyed on deterministic markers so re-running the seed
 * refreshes "today" instead of duplicating it.
 *
 * Run `npm run db:seed` right before a demo to re-anchor "today" to the current
 * date. Timestamps here are built relative to the run date.
 */
async function seedDemoState(opts: {
  patients: { id: string; userId: string; fullName: string; user: SeedUser }[];
  doctors: { id: string; userId: string; fullName: string }[];
  doctorByEmail: Map<string, { id: string; userId: string; fullName: string }>;
  doctorDeptMap: Map<string, string>;
  medicineByName: Map<string, { id: string; name: string }>;
  labTestByCode: Map<string, { id: string; code: string; referenceRange: string | null }>;
  usersByEmail: Map<string, { id: string; role: Role }>;
  labTechUserIds: string[];
  accountantUserIds: string[];
  receptionUserId?: string;
  pharmacistUserId?: string;
}) {
  const {
    patients,
    doctorByEmail,
    doctorDeptMap,
    medicineByName,
    labTestByCode,
    usersByEmail,
    labTechUserIds,
    accountantUserIds,
    receptionUserId,
    pharmacistUserId,
  } = opts;

  const patientByEmail = new Map(patients.map((p) => [p.user.email, p]));
  const at = (day: number, hour: number, minute = 0): Date => {
    const d = new Date();
    d.setDate(d.getDate() + day);
    d.setHours(hour, minute, 0, 0);
    return d;
  };
  const p = (email: string) => patientByEmail.get(email)!;
  const dr = (email: string) => doctorByEmail.get(email)!;

  // ── Today + tomorrow appointments ──────────────────────────────────────
  // Feeds the doctor, receptionist, and patient dashboards; the CONFIRMED rows
  // also give reception a QR to scan if the demo runs near their slot time.
  const demoAppts: {
    no: string;
    patientEmail: string;
    doctorEmail: string;
    day: number;
    hour: number;
    minute: number;
    status: AppointmentStatus;
    source: "ONLINE" | "WALK_IN";
    checkedInAt?: Date;
    consultStartAt?: Date;
    consultEndAt?: Date;
    createdAt?: Date;
    draftNote?: boolean;
    signedNote?: boolean;
  }[] = [
    {
      no: "APT-DEMO-001",
      patientEmail: "alex@example.com",
      doctorEmail: "sarah@medicore.com",
      day: 0,
      hour: 9,
      minute: 0,
      status: "CHECKED_IN",
      source: "ONLINE",
      checkedInAt: at(0, 8, 45),
      draftNote: true,
    },
    {
      no: "APT-DEMO-002",
      patientEmail: "amina@example.com",
      doctorEmail: "sarah@medicore.com",
      day: 0,
      hour: 9,
      minute: 30,
      status: "CHECKED_IN",
      source: "ONLINE",
      checkedInAt: at(0, 9, 15),
    },
    {
      no: "APT-DEMO-003",
      patientEmail: "brian@example.com",
      doctorEmail: "sarah@medicore.com",
      day: 0,
      hour: 10,
      minute: 0,
      status: "IN_CONSULTATION",
      source: "ONLINE",
      consultStartAt: at(0, 10, 0),
    },
    {
      no: "APT-DEMO-004",
      patientEmail: "carlos@example.com",
      doctorEmail: "sarah@medicore.com",
      day: 0,
      hour: 10,
      minute: 30,
      status: "CONFIRMED",
      source: "ONLINE",
    },
    {
      no: "APT-DEMO-005",
      patientEmail: "dina@example.com",
      doctorEmail: "sarah@medicore.com",
      day: 0,
      hour: 11,
      minute: 0,
      status: "PENDING_PAYMENT",
      source: "ONLINE",
    },
    {
      no: "APT-DEMO-006",
      patientEmail: "emily@example.com",
      doctorEmail: "david@medicore.com",
      day: 0,
      hour: 9,
      minute: 0,
      status: "CHECKED_IN",
      source: "WALK_IN",
      checkedInAt: at(0, 8, 50),
      createdAt: at(0, 8, 30),
    },
    {
      no: "APT-DEMO-007",
      patientEmail: "farah@example.com",
      doctorEmail: "david@medicore.com",
      day: 0,
      hour: 9,
      minute: 30,
      status: "CONFIRMED",
      source: "WALK_IN",
      createdAt: at(0, 9, 0),
    },
    {
      no: "APT-DEMO-008",
      patientEmail: "alex@example.com",
      doctorEmail: "sarah@medicore.com",
      day: 1,
      hour: 9,
      minute: 0,
      status: "CONFIRMED",
      source: "ONLINE",
    },
    {
      no: "APT-DEMO-009",
      patientEmail: "zara@example.com",
      doctorEmail: "sarah@medicore.com",
      day: 0,
      hour: 11,
      minute: 30,
      status: "COMPLETED",
      source: "ONLINE",
      consultStartAt: at(0, 11, 30),
      consultEndAt: at(0, 12, 0),
      signedNote: true,
    },
  ];

  for (const a of demoAppts) {
    const patient = p(a.patientEmail);
    const doctor = dr(a.doctorEmail);
    const start = at(a.day, a.hour, a.minute);
    const end = new Date(start.getTime() + 30 * 60 * 1000);

    const slot = await prisma.appointmentSlot.upsert({
      where: { doctorId_startTime: { doctorId: doctor.id, startTime: start } },
      update: { endTime: end, isBooked: true },
      create: { doctorId: doctor.id, startTime: start, endTime: end, isBooked: true },
    });

    const data: Prisma.AppointmentUncheckedCreateInput = {
      appointmentNo: a.no,
      patientId: patient.id,
      doctorId: doctor.id,
      slotId: slot.id,
      departmentId: doctorDeptMap.get(doctor.id) ?? null,
      status: a.status,
      source: a.source,
      reasonNote: "Routine consultation",
      qrToken: `demo-${a.no.toLowerCase()}`,
      checkedInAt: a.checkedInAt ?? null,
      consultStartAt: a.consultStartAt ?? null,
      consultEndAt: a.consultEndAt ?? null,
      createdById: a.source === "WALK_IN" ? (receptionUserId ?? null) : null,
    };
    if (a.createdAt) data.createdAt = a.createdAt;

    const appointment = await prisma.appointment.upsert({
      where: { appointmentNo: a.no },
      update: { ...data },
      create: { ...data },
    });

    if (a.draftNote) {
      await prisma.consultationNote.upsert({
        where: { appointmentId: appointment.id },
        update: { isDraft: true, signedAt: null },
        create: {
          appointmentId: appointment.id,
          authorUserId: doctor.userId,
          subjective:
            "Patient reports intermittent chest tightness on exertion. Discomfort resolves with rest.",
          objective: "BP 142/88, HR 78 regular. Cardiovascular exam unremarkable.",
          assessment: "Angina-like chest pain; rule out coronary artery disease.",
          plan: "Started amlodipine. Ordered lipid panel. Review in 2 weeks.",
          diagnosisCodes: ["I20.9"],
          isDraft: true,
          aiAssisted: false,
        },
      });
    }

    if (a.signedNote) {
      await prisma.consultationNote.upsert({
        where: { appointmentId: appointment.id },
        update: { isDraft: false, signedAt: at(0, 11, 5) },
        create: {
          appointmentId: appointment.id,
          authorUserId: doctor.userId,
          subjective: "Annual review. Patient feels well, no new complaints.",
          objective: "Vitals stable. Exam within normal limits.",
          assessment: "Routine wellness visit.",
          plan: "Continue current management. Next review in 6 months.",
          diagnosisCodes: ["Z00.00"],
          isDraft: false,
          aiAssisted: false,
          signedAt: at(0, 11, 5),
        },
      });
    }
  }

  // ── Queue tokens for today ────────────────────────────────────────────
  const queueRows = [
    {
      doctorEmail: "sarah@medicore.com",
      token: 1,
      patientEmail: "alex@example.com",
      status: "waiting",
    },
    {
      doctorEmail: "sarah@medicore.com",
      token: 2,
      patientEmail: "amina@example.com",
      status: "waiting",
    },
    {
      doctorEmail: "sarah@medicore.com",
      token: 3,
      patientEmail: "brian@example.com",
      status: "called",
      calledAt: at(0, 10, 0),
    },
    {
      doctorEmail: "david@medicore.com",
      token: 1,
      patientEmail: "emily@example.com",
      status: "waiting",
    },
  ];
  for (const q of queueRows) {
    const doctor = dr(q.doctorEmail);
    const patient = p(q.patientEmail);
    await prisma.queueToken.upsert({
      where: {
        doctorId_date_tokenNumber: { doctorId: doctor.id, date: at(0, 0, 0), tokenNumber: q.token },
      },
      update: { status: q.status, calledAt: q.calledAt ?? null, patientId: patient.id },
      create: {
        doctorId: doctor.id,
        date: at(0, 0, 0),
        tokenNumber: q.token,
        patientId: patient.id,
        status: q.status,
        calledAt: q.calledAt ?? null,
      },
    });
  }

  // ── Lab orders across every pending state ─────────────────────────────
  const cbc = labTestByCode.get("CBC")!;
  const bmp = labTestByCode.get("BMP")!;
  const lipid = labTestByCode.get("LIPID")!;
  const hba1c = labTestByCode.get("HBA1C")!;

  const labOrders: {
    orderNumber: string;
    patientEmail: string;
    doctorEmail: string;
    status: LabOrderStatus;
    orderedAt: Date;
    sampleCollectedAt?: Date;
    completedAt?: Date;
    verifiedAt?: Date;
    test: { id: string; referenceRange: string | null };
    result?: { value: string; unit: string; flag: ResultFlag };
  }[] = [
    // Ordered 3 days ago, never collected → overdue + awaiting collection.
    {
      orderNumber: "LAB-DEMO-ORD",
      patientEmail: "alex@example.com",
      doctorEmail: "sarah@medicore.com",
      status: "ORDERED",
      orderedAt: at(-3, 9, 0),
      test: cbc,
    },
    {
      orderNumber: "LAB-DEMO-ORD2",
      patientEmail: "dina@example.com",
      doctorEmail: "david@medicore.com",
      status: "ORDERED",
      orderedAt: at(0, 9, 15),
      test: bmp,
    },
    // Sample collected, results not yet entered.
    {
      orderNumber: "LAB-DEMO-COL",
      patientEmail: "amina@example.com",
      doctorEmail: "sarah@medicore.com",
      status: "SAMPLE_COLLECTED",
      orderedAt: at(-1, 11, 0),
      sampleCollectedAt: at(0, 8, 30),
      test: lipid,
    },
    // Completed, awaiting pathologist verification; CRITICAL flag alerts the doctor.
    {
      orderNumber: "LAB-DEMO-CRIT",
      patientEmail: "alex@example.com",
      doctorEmail: "sarah@medicore.com",
      status: "COMPLETED",
      orderedAt: at(-1, 14, 0),
      completedAt: at(0, 9, 45),
      test: cbc,
      result: { value: "6.8", unit: "g/dL", flag: "CRITICAL" },
    },
    // Verified today — a finished report the patient can see, feeding RAG.
    {
      orderNumber: "LAB-DEMO-VER",
      patientEmail: "brian@example.com",
      doctorEmail: "sarah@medicore.com",
      status: "VERIFIED",
      orderedAt: at(-1, 9, 30),
      sampleCollectedAt: at(-1, 9, 50),
      completedAt: at(-1, 11, 0),
      verifiedAt: at(-1, 12, 0),
      test: hba1c,
      result: { value: "7.1", unit: "%", flag: "HIGH" },
    },
  ];

  for (const o of labOrders) {
    const patient = p(o.patientEmail);
    const doctor = dr(o.doctorEmail);
    await prisma.labOrder.upsert({
      where: { orderNumber: o.orderNumber },
      update: {
        patientId: patient.id,
        doctorId: doctor.id,
        status: o.status,
        orderedAt: o.orderedAt,
        sampleCollectedAt: o.sampleCollectedAt ?? null,
        completedAt: o.completedAt ?? null,
        verifiedAt: o.verifiedAt ?? null,
        verifiedById: o.verifiedAt ? (labTechUserIds[0] ?? null) : null,
        notes: "Demo order",
      },
      create: {
        orderNumber: o.orderNumber,
        patientId: patient.id,
        doctorId: doctor.id,
        status: o.status,
        orderedAt: o.orderedAt,
        sampleCollectedAt: o.sampleCollectedAt ?? null,
        completedAt: o.completedAt ?? null,
        verifiedAt: o.verifiedAt ?? null,
        verifiedById: o.verifiedAt ? (labTechUserIds[0] ?? null) : null,
        notes: "Demo order",
        items: {
          create: [
            {
              labTestId: o.test.id,
              resultValue: o.result?.value ?? null,
              unit: o.result?.unit ?? null,
              referenceRange: o.test.referenceRange,
              flag: o.result?.flag ?? null,
            },
          ],
        },
      },
    });
  }

  // ── Pharmacy: pending dispenses + dispensed batches for recall ─────────
  const pendingRx = [
    {
      appointmentNo: "APT-1025",
      items: [
        { name: "Amoxicillin", qty: 30 },
        { name: "Metformin", qty: 60 },
      ],
    },
    { appointmentNo: "APT-1026", items: [{ name: "Lisinopril", qty: 30 }] },
    { appointmentNo: "APT-1027", items: [{ name: "Salbutamol Inhaler", qty: 1 }] },
  ];
  for (const rx of pendingRx) {
    const appt = await prisma.appointment.findUnique({
      where: { appointmentNo: rx.appointmentNo },
    });
    if (!appt) continue;
    const exists = await prisma.prescription.findUnique({ where: { appointmentId: appt.id } });
    if (exists) continue;
    await prisma.prescription.create({
      data: {
        appointmentId: appt.id,
        isDraft: false,
        dispenseStatus: "PENDING",
        notes: "Take as directed. Report any adverse reaction.",
        followUpAfterDays: 14,
        items: {
          create: rx.items.map((it) => ({
            medicineId: medicineByName.get(it.name)?.id,
            medicineName: it.name,
            dosage: "1 tab",
            frequency: "Once daily",
            durationDays: 14,
            quantityPrescribed: it.qty,
            instructions: "With food",
          })),
        },
      },
    });
  }

  // Dispensed on a shared batch so `recall` on that batch finds these patients.
  const dispensedRx = [
    { appointmentNo: "APT-1028", name: "Paracetamol", qty: 20, batch: "PCM-2026-A" },
    { appointmentNo: "APT-1029", name: "Paracetamol", qty: 20, batch: "PCM-2026-A" },
  ];
  for (const rx of dispensedRx) {
    const appt = await prisma.appointment.findUnique({
      where: { appointmentNo: rx.appointmentNo },
    });
    if (!appt) continue;
    const exists = await prisma.prescription.findUnique({ where: { appointmentId: appt.id } });
    if (exists) continue;
    const med = medicineByName.get(rx.name);
    const prescription = await prisma.prescription.create({
      data: {
        appointmentId: appt.id,
        isDraft: false,
        dispenseStatus: "DISPENSED",
        notes: "Dispensed at counter.",
        items: {
          create: [
            {
              medicineId: med?.id,
              medicineName: rx.name,
              dosage: "1 tab",
              frequency: "Every 6 hours",
              durationDays: 5,
              quantityPrescribed: rx.qty,
              quantityDispensed: rx.qty,
            },
          ],
        },
      },
    });
    if (med && pharmacistUserId) {
      const inventory = await prisma.inventory.findUnique({ where: { medicineId: med.id } });
      if (inventory) {
        await prisma.inventoryTransaction.create({
          data: {
            inventoryId: inventory.id,
            changeAmount: -rx.qty,
            reason: "dispense",
            batchNumber: rx.batch,
            prescriptionId: prescription.id,
            actorUserId: pharmacistUserId,
          },
        });
        await prisma.inventory.update({
          where: { id: inventory.id },
          data: { quantity: inventory.quantity - rx.qty },
        });
      }
    }
  }

  // ── Inventory extras: out of stock + expiring within 90 days ───────────
  const extraMeds = [
    {
      name: "Ciprofloxacin",
      genericName: "Ciprofloxacin HCl",
      unit: "mg",
      unitPrice: 0.6,
      category: "Antibiotic",
      quantity: 300,
      reorderLevel: 50,
      batchNumber: "CIP-2026-A",
      expiryDays: 60,
    },
    {
      name: "Nitroglycerin",
      genericName: "Glyceryl trinitrate",
      unit: "mg",
      unitPrice: 0.25,
      category: "Cardiac",
      quantity: 0,
      reorderLevel: 10,
      batchNumber: "NTG-2026-A",
      expiryDays: 365,
    },
  ];
  for (const m of extraMeds) {
    const med = await prisma.medicine.upsert({
      where: { name: m.name },
      update: {},
      create: {
        name: m.name,
        genericName: m.genericName,
        unit: m.unit,
        unitPrice: m.unitPrice,
        category: m.category,
      },
    });
    const exp = new Date();
    exp.setDate(exp.getDate() + m.expiryDays);
    await prisma.inventory.upsert({
      where: { medicineId: med.id },
      update: {
        quantity: m.quantity,
        reorderLevel: m.reorderLevel,
        batchNumber: m.batchNumber,
        expiryDate: exp,
      },
      create: {
        medicineId: med.id,
        quantity: m.quantity,
        reorderLevel: m.reorderLevel,
        batchNumber: m.batchNumber,
        expiryDate: exp,
      },
    });
  }

  // ── Discounts for the billing console ─────────────────────────────────
  const discounts = [
    { name: "Senior Citizen 10%", code: "SENIOR10", type: "percentage", value: 10 },
    { name: "Employee 15%", code: "STAFF15", type: "percentage", value: 15 },
    { name: "Wellness Coupon", code: "WELLNESS25", type: "fixed", value: 25 },
  ];
  for (const d of discounts) {
    await prisma.discount.upsert({
      where: { name: d.name },
      update: { isActive: true },
      create: {
        name: d.name,
        code: d.code,
        type: d.type,
        value: d.value,
        category: "General",
        isActive: true,
      },
    });
  }

  // ── Chat threads between patient and doctor ───────────────────────────
  const chatPairs = [
    {
      appointmentNo: "APT-1000",
      messages: [
        "Good morning Alex, how is the chest tightness?",
        "Much better doctor, thank you.",
        "Glad to hear it. Keep taking the medication as prescribed.",
      ],
    },
    {
      appointmentNo: "APT-1001",
      messages: [
        "Hello, any fever since yesterday?",
        "No fever today, appetite is back.",
        "Excellent — keep hydrated and rest.",
      ],
    },
  ];
  for (const c of chatPairs) {
    const appt = await prisma.appointment.findUnique({
      where: { appointmentNo: c.appointmentNo },
      include: { patient: { select: { userId: true } }, doctor: { select: { userId: true } } },
    });
    if (!appt) continue;
    const thread = await prisma.chatThread.upsert({
      where: { appointmentId: appt.id },
      update: { lastMessageAt: at(0, 7, 30) },
      create: { appointmentId: appt.id, lastMessageAt: at(0, 7, 30) },
    });
    const msgCount = await prisma.chatMessage.count({ where: { threadId: thread.id } });
    if (msgCount === 0) {
      for (let i = 0; i < c.messages.length; i++) {
        const senderId = i % 2 === 0 ? appt.doctor.userId : appt.patient.userId;
        await prisma.chatMessage.create({
          data: {
            threadId: thread.id,
            senderUserId: senderId,
            content: c.messages[i],
            sentAt: new Date(at(0, 7, 0).getTime() + i * 10 * 60 * 1000),
          },
        });
      }
    }
  }

  // ── Notifications for the bell ────────────────────────────────────────
  const alexPatient = p("alex@example.com");
  const notifications = [
    {
      email: "alex@example.com",
      type: "APPOINTMENT_CONFIRMED",
      title: "Appointment Confirmed",
      message: "Your appointment with Dr. Sarah Chen tomorrow at 09:00 is confirmed.",
      linkUrl: "/patient/appointments",
    },
    {
      email: "alex@example.com",
      type: "LAB_RESULT_READY",
      title: "Your lab results are ready",
      message: "Results for order LAB-SEED-0 have been verified and are now available.",
      linkUrl: "/patient/lab-results",
    },
    {
      email: "sarah@medicore.com",
      type: "CRITICAL_RESULT",
      title: "CRITICAL lab result",
      message: `${alexPatient.fullName} has 1 critical result requiring immediate review.`,
      linkUrl: "/lab/orders",
    },
    {
      email: "tom@medicore.com",
      type: "LOW_STOCK_ALERT",
      title: "Low stock",
      message: "Amlodipine is down to 40 (reorder level 90).",
      linkUrl: "/pharmacy/inventory",
    },
    {
      email: "tom@medicore.com",
      type: "EXPIRY_ALERT",
      title: "Stock expiring soon",
      message: "Ciprofloxacin expires in 60 days.",
      linkUrl: "/pharmacy/inventory",
    },
  ];
  for (const n of notifications) {
    const userId = usersByEmail.get(n.email)?.id;
    if (!userId) continue;
    const dup = await prisma.notification.findFirst({
      where: { userId, type: n.type, title: n.title },
    });
    if (dup) continue;
    await prisma.notification.create({
      data: {
        userId,
        type: n.type,
        title: n.title,
        message: n.message,
        linkUrl: n.linkUrl,
        channels: ["in_app"],
      },
    });
  }

  // ── Doctor conveniences: note templates + favourite prescriptions ─────
  const sarah = dr("sarah@medicore.com");
  const templates = [
    {
      name: "Chest pain workup",
      subjective: "Patient reports exertional chest tightness.",
      objective: "BP 140/85, HR 78 regular.",
      assessment: "Rule out ischaemia.",
      plan: "ECG, troponin, lipid panel. Review in 1 week.",
    },
    {
      name: "Hypertension follow-up",
      subjective: "Home BP readings 132-140/84-90 this month.",
      objective: "BP 136/86 today. No pedal oedema.",
      assessment: "Hypertension, controlled on current therapy.",
      plan: "Continue lisinopril. Repeat BP check in 1 month.",
    },
  ];
  for (const t of templates) {
    await prisma.noteTemplate.upsert({
      where: { doctorId_name: { doctorId: sarah.id, name: t.name } },
      update: {},
      create: {
        doctorId: sarah.id,
        name: t.name,
        subjective: t.subjective,
        objective: t.objective,
        assessment: t.assessment,
        plan: t.plan,
      },
    });
  }
  const favourites = [
    {
      name: "Metformin starter",
      items: [
        {
          medicineName: "Metformin",
          dosage: "500 mg",
          frequency: "Twice daily",
          durationDays: 30,
          instructions: "With meals",
          quantityPrescribed: 60,
        },
      ],
    },
    {
      name: "Amlodipine + statin",
      items: [
        {
          medicineName: "Amlodipine",
          dosage: "5 mg",
          frequency: "Once daily",
          durationDays: 30,
          instructions: "Morning",
          quantityPrescribed: 30,
        },
        {
          medicineName: "Atorvastatin",
          dosage: "20 mg",
          frequency: "Once daily",
          durationDays: 30,
          instructions: "Night",
          quantityPrescribed: 30,
        },
      ],
    },
  ];
  for (const f of favourites) {
    await prisma.favouritePrescription.upsert({
      where: { doctorId_name: { doctorId: sarah.id, name: f.name } },
      update: {},
      create: { doctorId: sarah.id, name: f.name, items: f.items as object },
    });
  }

  // ── Referrals ─────────────────────────────────────────────────────────
  const referrals: {
    reason: string;
    patientEmail: string;
    fromEmail: string;
    toEmail: string;
    status: ReferralStatus;
  }[] = [
    {
      reason: "DEMO-REF-1 Chronic knee pain warrants orthopaedic review",
      patientEmail: "alex@example.com",
      fromEmail: "sarah@medicore.com",
      toEmail: "meera@medicore.com",
      status: "PENDING",
    },
    {
      reason: "DEMO-REF-2 Suspected disc pathology",
      patientEmail: "brian@example.com",
      fromEmail: "meera@medicore.com",
      toEmail: "rafael@medicore.com",
      status: "ACCEPTED",
    },
    {
      reason: "DEMO-REF-3 Cardiology follow-up for murmur",
      patientEmail: "amina@example.com",
      fromEmail: "david@medicore.com",
      toEmail: "sarah@medicore.com",
      status: "COMPLETED",
    },
  ];
  for (const r of referrals) {
    const dup = await prisma.referral.findFirst({ where: { reason: r.reason } });
    if (dup) continue;
    await prisma.referral.create({
      data: {
        patientId: p(r.patientEmail).id,
        fromDoctorId: dr(r.fromEmail).id,
        toDoctorId: dr(r.toEmail).id,
        reason: r.reason,
        notes: "Seen in clinic.",
        status: r.status,
      },
    });
  }

  // ── Medical history for the primary demo patient (Alex) ───────────────
  const alex = p("alex@example.com");
  const alexId = alex.id;
  const sarahUser = dr("sarah@medicore.com").userId;

  if ((await prisma.vitalReading.count({ where: { patientId: alexId } })) === 0) {
    const vitals = [
      { type: "blood_pressure", value: 128, unit: "mmHg", rec: at(0, 8, 50) },
      { type: "heart_rate", value: 76, unit: "bpm", rec: at(0, 8, 50) },
      { type: "temperature", value: 36.8, unit: "°C", rec: at(0, 8, 50) },
      { type: "spo2", value: 98, unit: "%", rec: at(0, 8, 50) },
      { type: "blood_pressure", value: 142, unit: "mmHg", rec: at(-30, 10, 0) },
      { type: "blood_pressure", value: 138, unit: "mmHg", rec: at(-90, 11, 0) },
    ];
    for (const v of vitals) {
      await prisma.vitalReading.create({
        data: {
          patientId: alexId,
          recordedByUserId: sarahUser,
          type: v.type,
          value: v.value,
          unit: v.unit,
          recordedAt: v.rec,
        },
      });
    }
  }

  if ((await prisma.vaccination.count({ where: { patientId: alexId } })) === 0) {
    const vaccines = [
      {
        vaccineName: "Influenza (2025)",
        administeredAt: at(-200, 10, 0),
        nextDueAt: at(160, 10, 0),
      },
      { vaccineName: "COVID-19 Booster", administeredAt: at(-300, 11, 0), nextDueAt: null },
      { vaccineName: "Hepatitis B (Dose 3)", administeredAt: at(-800, 9, 0), nextDueAt: null },
    ];
    for (const v of vaccines) {
      await prisma.vaccination.create({
        data: {
          patientId: alexId,
          vaccineName: v.vaccineName,
          doseNumber: 1,
          administeredAt: v.administeredAt,
          administeredBy: "Dr. Sarah Chen",
          nextDueAt: v.nextDueAt ?? undefined,
        },
      });
    }
  }

  if ((await prisma.surgicalHistory.count({ where: { patientId: alexId } })) === 0) {
    await prisma.surgicalHistory.create({
      data: {
        patientId: alexId,
        procedure: "Laparoscopic appendectomy",
        performedAt: new Date("2010-05-14"),
        hospital: "St. Mary's Hospital",
        notes: "Uncomplicated recovery",
      },
    });
  }

  if ((await prisma.familyHistory.count({ where: { patientId: alexId } })) === 0) {
    await prisma.familyHistory.create({
      data: {
        patientId: alexId,
        relationship: "Mother",
        condition: "Type 2 Diabetes",
        notes: "Diagnosed at 55",
      },
    });
    await prisma.familyHistory.create({
      data: { patientId: alexId, relationship: "Father", condition: "Hypertension" },
    });
  }

  if ((await prisma.lifestyleProfile.count({ where: { patientId: alexId } })) === 0) {
    await prisma.lifestyleProfile.create({
      data: {
        patientId: alexId,
        smokingStatus: "Non-smoker",
        alcoholUse: "Social (1-2/week)",
        exerciseFreq: "3x/week",
        dietNotes: "Balanced, low salt",
      },
    });
  }

  if ((await prisma.emergencyContact.count({ where: { patientId: alexId } })) === 0) {
    await prisma.emergencyContact.create({
      data: {
        patientId: alexId,
        name: "Jane Johnson",
        relationship: "Spouse",
        phone: "+1 555-0101",
        isPrimary: true,
      },
    });
  }

  if ((await prisma.patientInsurance.count({ where: { patientId: alexId } })) === 0) {
    await prisma.patientInsurance.create({
      data: {
        patientId: alexId,
        providerName: "Blue Cross",
        policyNumber: "BC-88412-901",
        coveragePercentage: 80,
        validUntil: new Date("2027-06-30"),
        isActive: true,
      },
    });
  }

  // Alex as guardian of Nathan — powers the dependant booking/records demos.
  const nathan = patientByEmail.get("nathan@example.com");
  if (nathan) {
    const rel = await prisma.patientRelationship.findUnique({
      where: {
        guardianPatientId_dependentPatientId: {
          guardianPatientId: alexId,
          dependentPatientId: nathan.id,
        },
      },
    });
    if (!rel) {
      await prisma.patientRelationship.create({
        data: {
          guardianPatientId: alexId,
          dependentPatientId: nathan.id,
          relationship: "Parent",
          canBookAppointments: true,
          canViewRecords: true,
        },
      });
    }
  }

  // ── Recent-patient audit rows for clinician dashboards ────────────────
  const recentAudits = [
    {
      actorEmail: "sarah@medicore.com",
      patientEmails: [
        "alex@example.com",
        "amina@example.com",
        "brian@example.com",
        "carlos@example.com",
      ],
    },
    { actorEmail: "tom@medicore.com", patientEmails: ["alex@example.com", "brian@example.com"] },
    { actorEmail: "lab@medicore.com", patientEmails: ["alex@example.com", "amina@example.com"] },
  ];
  for (const ra of recentAudits) {
    const actorId = usersByEmail.get(ra.actorEmail)?.id;
    if (!actorId) continue;
    for (const patientEmail of ra.patientEmails) {
      const patient = patientByEmail.get(patientEmail);
      if (!patient) continue;
      const dup = await prisma.auditLog.findFirst({
        where: {
          actorUserId: actorId,
          action: "PATIENT_HISTORY_VIEWED",
          targetType: "patient",
          targetId: patient.id,
        },
      });
      if (dup) continue;
      await prisma.auditLog.create({
        data: {
          actorUserId: actorId,
          action: "PATIENT_HISTORY_VIEWED",
          targetType: "patient",
          targetId: patient.id,
          ipAddress: "127.0.0.1",
          metadata: { seeded: true },
        },
      });
    }
  }

  // ── Live billing: a payment today + a historical refund ───────────────
  // Revenue today KPI needs a SUCCEEDED payment dated today. BL-SEED-1000 is a
  // seeded partially-paid bill, so a cash payment here keeps a balance (and stays
  // refundable live in the demo).
  const partialBill = await prisma.bill.findUnique({ where: { billNumber: "BL-SEED-1000" } });
  if (partialBill && partialBill.balance.greaterThan(0)) {
    const todayCash = await prisma.payment.findFirst({
      where: { billId: partialBill.id, reference: "DEMO-CASH-TODAY" },
    });
    if (!todayCash) {
      await prisma.payment.create({
        data: {
          billId: partialBill.id,
          amount: 25,
          method: "CASH",
          status: "SUCCEEDED",
          receivedById: accountantUserIds[0] ?? null,
          reference: "DEMO-CASH-TODAY",
        },
      });
      const newPaid = Number(partialBill.amountPaid) + 25;
      const newBalance = Number(partialBill.total) - newPaid;
      await prisma.bill.update({
        where: { id: partialBill.id },
        data: {
          amountPaid: newPaid,
          balance: newBalance,
          status: newBalance <= 0 ? "paid" : "partially_paid",
        },
      });
    }
  }

  // A historical cash refund so the accountant's "Refunds" KPI is non-zero.
  const paidBill = await prisma.bill.findUnique({ where: { billNumber: "BL-SEED-1002" } });
  if (paidBill) {
    const pay = await prisma.payment.findFirst({
      where: { billId: paidBill.id, providerRef: null },
    });
    if (pay && pay.refundedAmount.equals(0)) {
      const refundAmount = Math.min(40, Number(pay.amount));
      await prisma.payment.update({
        where: { id: pay.id },
        data: {
          refundedAmount: refundAmount,
          refundedAt: at(-2, 16, 0),
          status: refundAmount >= Number(pay.amount) ? "REFUNDED" : "SUCCEEDED",
        },
      });
      const newPaid = Number(paidBill.amountPaid) - refundAmount;
      await prisma.bill.update({
        where: { id: paidBill.id },
        data: {
          amountPaid: newPaid,
          balance: Number(paidBill.total) - newPaid,
          status: newPaid >= Number(paidBill.total) ? "paid" : "partially_paid",
        },
      });
    }
  }

  console.log(
    "[seed] Demo-day state ready — appointments today, queue, pending lab/pharmacy work, chat, notifications, discounts, recalls, dependants.",
  );
}
