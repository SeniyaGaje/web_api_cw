// SQL for SLSEA users (seeded; there are no /users endpoints).
const { pool } = require('../db/pool');

// The user plus their jurisdiction as province_id / district_id:
// provincial -> province_id; district -> district_id and its province; national/admin -> neither.
async function findUserByUsername(username) {
  const { rows } = await pool.query(
    `SELECT u.user_id, u.password_hash, u.role,
            CASE WHEN u.role = 'provincial' THEN u.jurisdiction_id ELSE d.province_id END AS province_id,
            d.district_id
       FROM users u
       LEFT JOIN districts d ON u.role = 'district' AND d.district_id = u.jurisdiction_id
      WHERE u.username = $1`,
    [username]
  );
  return rows[0] || null;
}

module.exports = { findUserByUsername };
