import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const DEMO_PASSWORD = "demo1234";

async function main() {
  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);

  // ── Departments ──────────────────────────────────────────────────────
  const departments = [
    { name: "Cardiology", slug: "cardiology", description: "Heart and cardiovascular system" },
    { name: "Pediatrics", slug: "pediatrics", description: "Medical care for infants, children, and adolescents" },
    { name: "Orthopedics", slug: "orthopedics", description: "Musculoskeletal system" },
    { name: "Neurology", slug: "neurology", description: "Nervous system disorders" },
    { name: "Dermatology", slug: "dermatology", description: "Skin, hair, and nails" },
    { name: "Ophthalmology", slug: "ophthalmology", description: "Eye and vision care" },
    { name: "ENT", slug: "ent", description: "Ear, nose, and throat" },
    { name: "Gynecology", slug: "gynecology", description: "Female reproductive health" },
    { name: "Psychiatry", slug: "psychiatry", description: "Mental health" },
    { name: "Emergency", slug: "emergency", description: "Emergency medicine" },
    { name: "General Medicine", slug: "general-medicine", description: "Internal medicine and primary care" },
    { name: "Radiology", slug: "radiology", description: "Medical imaging and diagnostics" },
  ];

  for (const dept of departments) {
    await prisma.department.upsert({
      where: { slug: dept.slug },
      update: {},
      create: dept,
    });
  }

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

  // ── Demo Users ──────────────────────────────────────────────────────
  const demoUsers: { email: string; role: "PATIENT" | "DOCTOR" | "RECEPTIONIST" | "PHARMACIST" | "LAB_TECHNICIAN" | "ACCOUNTANT" | "ADMIN"; fullName: string }[] = [
    { email: "alex@example.com", role: "PATIENT", fullName: "Alex Johnson" },
    { email: "sarah@medicore.com", role: "DOCTOR", fullName: "Dr. Sarah Chen" },
    { email: "reception@medicore.com", role: "RECEPTIONIST", fullName: "Emma Wilson" },
    { email: "tom@medicore.com", role: "PHARMACIST", fullName: "Tom Martinez" },
    { email: "lab@medicore.com", role: "LAB_TECHNICIAN", fullName: "James Brown" },
    { email: "linda@medicore.com", role: "ACCOUNTANT", fullName: "Linda Davis" },
    { email: "mark@medicore.com", role: "ADMIN", fullName: "Mark Thompson" },
  ];

  for (const u of demoUsers) {
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

    switch (u.role) {
      case "PATIENT": {
        const mrn = `MRN-${String(Math.floor(10000 + Math.random() * 90000))}`;
        await prisma.patient.upsert({
          where: { userId: user.id },
          update: {},
          create: {
            userId: user.id,
            mrn,
            fullName: u.fullName,
            gender: "Male",
            bloodGroup: "O+",
          },
        });
        break;
      }
      case "DOCTOR":
        await prisma.doctor.upsert({
          where: { userId: user.id },
          update: {},
          create: {
            userId: user.id,
            fullName: u.fullName,
            consultationFee: 150,
            consultationMins: 30,
            verificationStatus: "VERIFIED",
            qualifications: ["MD", "Board Certified"],
            languages: ["English", "Mandarin"],
          },
        });
        break;
      case "RECEPTIONIST":
        await prisma.receptionist.upsert({
          where: { userId: user.id },
          update: {},
          create: { userId: user.id, fullName: u.fullName, deskLocation: "Front Desk A" },
        });
        break;
      case "PHARMACIST":
        await prisma.pharmacist.upsert({
          where: { userId: user.id },
          update: {},
          create: { userId: user.id, fullName: u.fullName, licenseNo: "PH-12345" },
        });
        break;
      case "LAB_TECHNICIAN":
        await prisma.labTechnician.upsert({
          where: { userId: user.id },
          update: {},
          create: { userId: user.id, fullName: u.fullName, licenseNo: "LT-67890", canVerify: true },
        });
        break;
      case "ACCOUNTANT":
        await prisma.accountant.upsert({
          where: { userId: user.id },
          update: {},
          create: { userId: user.id, fullName: u.fullName },
        });
        break;
      case "ADMIN":
        // ADMIN uses the User record directly, no profile table
        break;
    }
  }

  // ── Lab Tests Catalog ──────────────────────────────────────────────
  const labTests = [
    { name: "Complete Blood Count", code: "CBC", category: "Hematology", sampleType: "Blood", price: 35, turnaroundHours: 24 },
    { name: "Basic Metabolic Panel", code: "BMP", category: "Chemistry", sampleType: "Blood", price: 50, turnaroundHours: 24 },
    { name: "Comprehensive Metabolic Panel", code: "CMP", category: "Chemistry", sampleType: "Blood", price: 65, turnaroundHours: 24 },
    { name: "Lipid Panel", code: "LIPID", category: "Chemistry", sampleType: "Blood", price: 45, turnaroundHours: 24 },
    { name: "Thyroid Stimulating Hormone", code: "TSH", category: "Endocrinology", sampleType: "Blood", price: 55, turnaroundHours: 48 },
    { name: "Hemoglobin A1C", code: "HBA1C", category: "Endocrinology", sampleType: "Blood", price: 40, turnaroundHours: 24 },
    { name: "Urinalysis", code: "UA", category: "Urinalysis", sampleType: "Urine", price: 25, turnaroundHours: 24 },
    { name: "Chest X-Ray", code: "CXR", category: "Radiology", sampleType: "X-Ray", price: 120, turnaroundHours: 2 },
    { name: "COVID-19 PCR", code: "COVID-PCR", category: "Infectious Disease", sampleType: "Nasal Swab", price: 100, turnaroundHours: 24 },
    { name: "Liver Function Test", code: "LFT", category: "Chemistry", sampleType: "Blood", price: 45, turnaroundHours: 24 },
  ];

  for (const test of labTests) {
    await prisma.labTest.upsert({
      where: { code: test.code },
      update: {},
      create: test,
    });
  }

  // ── Medicines Catalog ──────────────────────────────────────────────
  const medicines = [
    { name: "Amoxicillin", genericName: "Amoxicillin", unit: "mg", unitPrice: 0.15, category: "Antibiotic" },
    { name: "Azithromycin", genericName: "Azithromycin", unit: "mg", unitPrice: 0.50, category: "Antibiotic" },
    { name: "Metformin", genericName: "Metformin HCl", unit: "mg", unitPrice: 0.08, category: "Antidiabetic" },
    { name: "Atorvastatin", genericName: "Atorvastatin Calcium", unit: "mg", unitPrice: 0.12, category: "Cholesterol" },
    { name: "Lisinopril", genericName: "Lisinopril", unit: "mg", unitPrice: 0.10, category: "ACE Inhibitor" },
    { name: "Omeprazole", genericName: "Omeprazole", unit: "mg", unitPrice: 0.15, category: "PPI" },
    { name: "Ibuprofen", genericName: "Ibuprofen", unit: "mg", unitPrice: 0.05, category: "NSAID" },
    { name: "Paracetamol", genericName: "Acetaminophen", unit: "mg", unitPrice: 0.03, category: "Analgesic" },
    { name: "Amlodipine", genericName: "Amlodipine Besylate", unit: "mg", unitPrice: 0.11, category: "Calcium Channel Blocker" },
    { name: "Salbutamol Inhaler", genericName: "Albuterol Sulfate", unit: "mcg", unitPrice: 3.50, category: "Bronchodilator" },
  ];

  for (const med of medicines) {
    await prisma.medicine.upsert({
      where: { name: med.name },
      update: {},
      create: med,
    });
  }

  // ── Drug Interactions ──────────────────────────────────────────────
  const interactions = [
    { drugA: "amoxicillin", drugB: "warfarin", severity: "MODERATE" as const, description: "May increase bleeding risk" },
    { drugA: "lisinopril", drugB: "spironolactone", severity: "SEVERE" as const, description: "Risk of hyperkalemia" },
    { drugA: "ibuprofen", drugB: "warfarin", severity: "SEVERE" as const, description: "Increased bleeding risk" },
    { drugA: "metformin", drugB: "iodinated contrast", severity: "MODERATE" as const, description: "Risk of lactic acidosis; withhold metformin before contrast" },
    { drugA: "omeprazole", drugB: "clopidogrel", severity: "MODERATE" as const, description: "Reduced clopidogrel efficacy" },
  ];

  for (const interaction of interactions) {
    const [a, b] = [interaction.drugA, interaction.drugB].sort();
    await prisma.drugInteraction.upsert({
      where: { drugA_drugB: { drugA: a, drugB: b } },
      update: {},
      create: { drugA: a, drugB: b, severity: interaction.severity, description: interaction.description },
    });
  }

  console.log("Seed complete — demo users, departments, lab tests, medicines, drug interactions.");
  console.log("All demo accounts password: demo1234");
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
