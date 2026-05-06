import { PrismaClient, UserRole } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

const SEED_PASSWORD = "Password@123";
const BCRYPT_ROUNDS = 10;

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
  "Baker", "Adams", "Nelson", "Carter", "Mitchell", "Perez", "Roberts",
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

function generateNid(index: number): string {
  return `NID${String(index).padStart(8, "0")}`;
}

function generateIdentifier(index: number): string {
  return `EMP${String(index).padStart(5, "0")}`;
}

function generatePhone(): string {
  return `+1${Math.floor(2000000000 + Math.random() * 8000000000)}`;
}

interface UserSeed {
  email: string;
  passwordHash: string;
  role: UserRole;
  isVerified: boolean;
  isActive: boolean;
  firstName: string;
  lastName: string;
  contact: string;
  address: string;
  dob: Date;
  nid: string;
  designation: string;
  department: string;
  position: string;
  identifierNumber: string;
}

async function buildUsers(passwordHash: string): Promise<UserSeed[]> {
  const users: UserSeed[] = [];

  for (let i = 1; i <= 200; i++) {
    const firstName = pick(firstNames);
    const lastName = pick(lastNames);
    const tag = `${firstName.toLowerCase()}.${lastName.toLowerCase()}${i}`;
    const email = `${tag}@example.com`;

    let role: UserRole = UserRole.USER;
    if (i <= 2) role = UserRole.ADMIN;
    else if (i <= 10) role = UserRole.MODERATOR;

    users.push({
      email,
      passwordHash,
      role,
      isVerified: Math.random() > 0.2,
      isActive: Math.random() > 0.05,
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
    });
  }

  return users;
}

async function main() {
  console.log("Hashing seed password...");
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, BCRYPT_ROUNDS);

  console.log("Building user data...");
  const users = await buildUsers(passwordHash);

  console.log(`Seeding ${users.length} users...`);

  let created = 0;
  let skipped = 0;

  for (const user of users) {
    const existing = await prisma.user.findUnique({ where: { email: user.email } });
    if (existing) {
      skipped++;
      continue;
    }
    await prisma.user.create({ data: user });
    created++;
  }

  console.log(`Done. Created: ${created}, Skipped (already exist): ${skipped}`);
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
