import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { storage } from '../server/storage';

async function main() {
  const admins = [
    { email: process.env.ADMIN1_EMAIL, password: process.env.ADMIN1_PASSWORD },
    { email: process.env.ADMIN2_EMAIL, password: process.env.ADMIN2_PASSWORD },
    { email: process.env.ADMIN3_EMAIL, password: process.env.ADMIN3_PASSWORD },
  ].filter(a => a.email && a.password) as {email:string,password:string}[];

  if (admins.length === 0) { console.log('No admin env vars set; skipping.'); process.exit(0); }

  for (const a of admins) {
    const existing = await storage.getUserByEmail(a.email!);
    if (existing) {
      await storage.updateUser(existing.id, { isAdmin: true, role: 'admin', creditsUnlimited: true });
      console.log(`✔ Updated existing admin ${a.email}`);
      continue;
    }
    const hash = await bcrypt.hash(a.password!, 12);
    const user = await storage.createUser({
      email: a.email!,
      passwordHash: hash,
      isAdmin: true,
      role: 'admin',
      creditsUnlimited: true,
      accountStatus: 'active',
      subscriptionStatus: 'active',
      tier: 'enterprise',
      username: a.email!.split('@')[0],
      displayName: a.email!.split('@')[0],
      emailVerified: true
    } as any);
    console.log(`✔ Created admin ${a.email} (${user.id})`);
  }
}
main().catch(err => { console.error(err); process.exit(1); });
