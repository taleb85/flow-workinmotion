import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: 'postgresql://postgres.iuvfkxygwjbdunwqumcb:yPVcQrOjZbKx74xyPWyoQIjL2exJ0Oe@aws-1-eu-west-1.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  try {
    const test = await pool.query('SELECT 1 as test');
    console.log('OK:', test.rows[0].test);
    
    const stati = await pool.query('SELECT approval_status, COUNT(*) as cnt FROM shifts GROUP BY approval_status');
    console.log('STATI:');
    stati.rows.forEach(row => console.log(' ', row.approval_status, row.cnt));
    
    const upd = await pool.query("UPDATE shifts SET approval_status = 'confirmed' WHERE approval_status = 'approved'");
    console.log('AGGIORNATI:', upd.rowCount);
    
    const alt1 = await pool.query('ALTER TABLE shifts DROP COLUMN IF EXISTS approved_at');
    const alt2 = await pool.query('ALTER TABLE shifts DROP COLUMN IF EXISTS approved_by');
    const alt3 = await pool.query('ALTER TABLE shifts DROP COLUMN IF EXISTS approved_start_time');
    const alt4 = await pool.query('ALTER TABLE shifts DROP COLUMN IF EXISTS approved_end_time');
    console.log('COLONNE RIMOSSE');
    
    await pool.query('DROP TABLE IF EXISTS punch_audit_log CASCADE');
    console.log('TABLE DROPPED');
    
    console.log('MIGRAZIONE COMPLETATA');
  } catch(err) {
    console.error('ERR:', err.message);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

main();
