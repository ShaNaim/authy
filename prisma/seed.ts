import { PrismaClient, UserRole } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

const SEED_PASSWORD = "Password@123";
const BCRYPT_ROUNDS = 10;
const SEED_EMAIL_DOMAIN = "@example.com";

const firstNames = [
  "Alice", "Bob", "Carol", "David", "Emma", "Frank", "Grace", "Henry",
  "Isla", "James", "Karen", "Liam", "Mia", "Noah", "Olivia", "Paul",
  "Quinn", "Rachel", "Sam", "Tara", "Uma", "Victor", "Wendy", "Xander",
  "Yara", "Zoe", "Aaron", "Bella", "Carlos", "Diana", "Ethan", "Fiona",
  "George", "Hannah", "Ivan", "Julia", "Kevin", "Laura", "Marcus", "Nina",
  "Oscar", "Priya", "Ravi", "Sophia", "Tom", "Ursula", "Vince", "Willa",
];

const lastNames = [
  "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller",
  "Davis", "Martinez", "Anderson", "Taylor", "Thomas", "Hernandez", "Moore",
  "Martin", "Jackson", "Thompson", "White", "Lopez", "Lee", "Gonzalez",
  "Harris", "Clark", "Lewis", "Robinson", "Walker", "Perez", "Hall",
  "Young", "Allen", "Sanchez", "Wright", "King", "Scott", "Green",
  "Baker", "Adams", "Nelson", "Carter", "Mitchell", "Roberts",
];

const departments = [
  "Engineering", "Product", "Design", "Marketing", "Finance",
  "Human Resources", "Operations", "Sales", "Legal", "Customer Success",
];

const positions = [
  "Junior", "Mid-level", "Senior", "Lead", "Principal", "Staff",
];

const designations = [
  "Software Engineer", "Product Manager", "Designer", "Marketing Specialist",
  "Financial Analyst", "HR Manager", "Operations Manager", "Sales Executive",
  "Legal Counsel", "Customer Success Manager", "Data Analyst", "DevOps Engineer",
];

const addresses = [
  "12 Oak Street, Springfield", "45 Maple Ave, Shelbyville", "7 Pine Road, Capital City",
  "33 Elm Boulevard, Ogdenville", "89 Birch Lane, North Haverbrook",
  "21 Cedar Drive, Brockway", "56 Walnut Court, Waverly Hills",
  "14 Ash Street, Cypress Creek", "77 Willow Way, Shelbyville",
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomDate(start: Date, end: Date): Date {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

// 20-digit numeric string required by the schema
function generateNid(index: number): string {
  return String(index).padStart(20, "0");
}

function generateIdentifier(index: number): string {
  return `EMP${String(index).padStart(5, "0")}`;
}

function generatePhone(): string {
  return `+1${Math.floor(2000000000 + Math.random() * 8000000000)}`;
}

/**
 * Status distribution (200 users):
 *   i  1 –  2 → ADMIN,      active:   isVerified true,  isActive true   (5%)
 *   i  3 – 10 → MODERATOR,  active:   isVerified true,  isActive true
 *   i 11 –160 → USER,       unverified: isVerified false, isActive false (75%)
 *   i 161–200 → USER,       suspended:  isVerified true,  isActive false (20%)
 */
function resolveStatus(i: number): { isVerified: boolean; isActive: boolean } {
  if (i <= 10) return { isVerified: true, isActive: true };    // active
  if (i <= 160) return { isVerified: false, isActive: false }; // unverified
  return { isVerified: true, isActive: false };                // suspended
}

function resolveRole(i: number): UserRole {
  if (i <= 2) return UserRole.ADMIN;
  if (i <= 10) return UserRole.MODERATOR;
  return UserRole.USER;
}

async function main() {
  // ── 1. Remove all previously seeded users ─────────────────────────────────
  console.log("Removing previously seeded users...");
  const { count: deleted } = await prisma.user.deleteMany({
    where: { email: { endsWith: SEED_EMAIL_DOMAIN } },
  });
  console.log(`Deleted ${deleted} existing seed users.`);

  // ── 2. Hash shared password once ──────────────────────────────────────────
  console.log("Hashing seed password...");
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, BCRYPT_ROUNDS);

  // ── 3. Create 200 users ───────────────────────────────────────────────────
  console.log("Seeding 200 users...");

  for (let i = 1; i <= 200; i++) {
    const firstName = pick(firstNames);
    const lastName = pick(lastNames);
    const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}${i}${SEED_EMAIL_DOMAIN}`;

    await prisma.user.create({
      data: {
        email,
        passwordHash,
        role: resolveRole(i),
        ...resolveStatus(i),
        firstName,
        lastName,
        contact: generatePhone(),
        address: pick(addresses),
        dob: randomDate(new Date("1970-01-01"), new Date("2000-12-31")),
        nid: generateNid(i),
        designation: pick(designations),
        department: pick(departments),
        position: pick(positions),
        identifierNumber: generateIdentifier(i),
      },
    });
  }

  console.log("Done.");
  console.log("  Admins (active + verified):      2  (1%)");
  console.log("  Moderators (active + verified):  8  (4%)");
  console.log("  Users — unverified:            150 (75%)");
  console.log("  Users — suspended:              40 (20%)");
  console.log(`  Shared password: ${SEED_PASSWORD}`);
}

main()
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
