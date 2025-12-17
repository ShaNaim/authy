import { env } from "@/config/env";
import { UserRole, PASSWORD_REQUIREMENTS } from "@/constants";

console.log("🔧 Testing Configuration...\n");

console.log("Environment:", env.NODE_ENV);
console.log("Port:", env.PORT);
console.log("Database:", env.DATABASE_URL.substring(0, 30) + "...");
console.log("JWT Access Secret Length:", env.JWT_ACCESS_SECRET.length);
console.log("JWT Refresh Secret Length:", env.JWT_REFRESH_SECRET.length);

console.log("\nConstants loaded:");
console.log("User Roles:", Object.values(UserRole));
console.log("Password Min Length:", PASSWORD_REQUIREMENTS.minLength);

console.log("\n✅ Configuration loaded successfully!");
