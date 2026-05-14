import bcrypt from 'bcryptjs';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

const headers = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
};

async function migratePasswords() {
  console.log('Fetching all customers...');

  const res = await fetch(`${SUPABASE_URL}/rest/v1/customers?select=email,password`, { headers });
  const customers = await res.json();

  console.log(`Found ${customers.length} customers`);

  let migrated = 0;
  let skipped = 0;

  for (const customer of customers) {
    // Skip if already hashed (bcrypt hashes start with $2b$)
    if (customer.password && customer.password.startsWith('$2b$')) {
      console.log(`SKIP (already hashed): ${customer.email}`);
      skipped++;
      continue;
    }

    const hashed = await bcrypt.hash(customer.password, 10);

    const update = await fetch(
      `${SUPABASE_URL}/rest/v1/customers?email=eq.${encodeURIComponent(customer.email)}`,
      {
        method: 'PATCH',
        headers: { ...headers, 'Prefer': 'return=minimal' },
        body: JSON.stringify({ password: hashed }),
      }
    );

    if (update.ok) {
      console.log(`MIGRATED: ${customer.email}`);
      migrated++;
    } else {
      const err = await update.text();
      console.error(`FAILED: ${customer.email} — ${err}`);
    }
  }

  console.log(`\nDone. Migrated: ${migrated} | Skipped (already hashed): ${skipped}`);
}

migratePasswords().catch(console.error);
