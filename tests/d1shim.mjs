const UNIQUE = {
  companies: [['id']],
  company_members: [['company_id', 'user_id']],
  invitations: [['id'], ['token_hash']],
  departments: [['id'], ['company_id', 'name']],
  projects: [['id']],
  tasks: [['id']],
  task_comments: [['id']],
  calendar_events: [['id']],
  customers: [['id']],
  documents: [['id'], ['r2_key']],
  notifications: [['id']],
  activity_logs: [['id']],
  dashboard_layouts: [['id']],
  company_settings: [['company_id']],
  dash_rate_limits: [['user_id', 'endpoint', 'window_start']],
  dashboard_users: [['id'], ['email']],
  dashboard_sessions: [['id'], ['token_hash']],
  dashboard_backup_codes: [['id'], ['code_hash']],
  users: [['id']],
  sessions: [['id']],
  entitlements: [['user_id']],
};

function normalize(sql) {
  return sql.replace(/\s+/g, ' ').trim().replace(/;$/, '');
}

function splitTopLevel(text, delimiter) {
  return text.split(delimiter);
}

class ShimStmt {
  constructor(db, sql) {
    this.db = db;
    this.sql = normalize(sql);
    this.params = [];
  }

  bind(...params) {
    this.params = params;
    return this;
  }

  matchConds(row, whereClause) {
    if (!whereClause) return true;
    const parts = splitTopLevel(whereClause, ' AND ');
    let paramIndex = 0;
    for (const raw of parts) {
      const cond = raw.trim();
      let m = cond.match(/^(\w+) IS NULL$/i);
      if (m) {
        if (row[m[1]] !== null && row[m[1]] !== undefined) return false;
        continue;
      }
      m = cond.match(/^(\w+) IS NOT NULL$/i);
      if (m) {
        if (row[m[1]] === null || row[m[1]] === undefined) return false;
        continue;
      }
      m = cond.match(/^LOWER\((\w+)\) = \?$/i);
      if (m) {
        const value = this.params[paramIndex++];
        if (String(row[m[1]] ?? '').toLowerCase() !== String(value).toLowerCase()) return false;
        continue;
      }
      m = cond.match(/^(\w+) (=|>|<|>=|<=|!=) \?$/);
      if (m) {
        const value = this.params[paramIndex++];
        const cell = row[m[1]];
        if (m[2] === '=' && cell !== value) return false;
        if (m[2] === '!=' && cell === value) return false;
        if (m[2] === '>' && !(cell > value)) return false;
        if (m[2] === '<' && !(cell < value)) return false;
        if (m[2] === '>=' && !(cell >= value)) return false;
        if (m[2] === '<=' && !(cell <= value)) return false;
        continue;
      }
      m = cond.match(/^(\w+) = '([^']*)'$/);
      if (m) {
        if (row[m[1]] !== m[2]) return false;
        continue;
      }
      m = cond.match(/^(\w+) = (\d+)$/);
      if (m) {
        if (row[m[1]] !== Number(m[2])) return false;
        continue;
      }
      throw new Error('Unsupported condition: ' + cond);
    }
    return true;
  }

  runSelect() {
    const m = this.sql.match(/^SELECT \* FROM (\w+)(?: WHERE (.+?))?(?: ORDER BY (\w+)( ASC| DESC)?)?$/i);
    if (!m) throw new Error('Unsupported SELECT: ' + this.sql);
    const rows = this.db.table(m[1]).filter((row) => this.matchConds(row, m[2]));
    if (m[3]) {
      const col = m[3];
      const desc = (m[4] || '').trim() === 'DESC';
      rows.sort((a, b) => {
        if (a[col] < b[col]) return desc ? 1 : -1;
        if (a[col] > b[col]) return desc ? -1 : 1;
        return 0;
      });
    }
    return rows;
  }

  async first() {
    const rows = this.runSelect();
    return rows.length ? rows[0] : null;
  }

  async all() {
    return { results: this.runSelect() };
  }

  async run() {
    let m = this.sql.match(/^INSERT INTO (\w+) \(([^)]+)\) VALUES \(([^)]+)\)$/i);
    if (m) {
      const table = this.db.table(m[1]);
      const cols = m[2].split(',').map((c) => c.trim());
      const tokens = m[3].split(',').map((c) => c.trim());
      const row = {};
      let paramIndex = 0;
      cols.forEach((col, i) => {
        const token = tokens[i];
        if (token === '?') row[col] = this.params[paramIndex++];
        else if (/^\d+$/.test(token)) row[col] = Number(token);
        else if (/^'[^']*'$/.test(token)) row[col] = token.slice(1, -1);
        else if (/^NULL$/i.test(token)) row[col] = null;
        else throw new Error('Unsupported value: ' + token);
      });
      const uniques = UNIQUE[m[1]] || [['id']];
      for (const keySet of uniques) {
        const clash = table.find((existing) => keySet.every((col) => existing[col] !== null && existing[col] !== undefined && existing[col] === row[col]));
        if (clash) throw new Error('UNIQUE constraint failed: ' + m[1]);
      }
      table.push(row);
      return { meta: { changes: 1 } };
    }
    m = this.sql.match(/^UPDATE (\w+) SET (.+?) WHERE (.+)$/i);
    if (m) {
      const rows = this.db.table(m[1]);
      const setParts = splitTopLevel(m[2], ',');
      let paramIndex = 0;
      const assignments = [];
      for (const raw of setParts) {
        const part = raw.trim();
        const inc = part.match(/^(\w+) = \1 \+ 1$/);
        if (inc) {
          assignments.push({ col: inc[1], increment: true });
          continue;
        }
        const simple = part.match(/^(\w+) = \?$/);
        if (simple) {
          assignments.push({ col: simple[1], value: this.params[paramIndex++] });
          continue;
        }
        throw new Error('Unsupported SET: ' + part);
      }
      const savedParams = this.params;
      let changes = 0;
      for (const row of rows) {
        this.params = savedParams.slice(paramIndex);
        if (!this.matchConds(row, m[3])) continue;
        for (const assignment of assignments) {
          if (assignment.increment) row[assignment.col] = (row[assignment.col] || 0) + 1;
          else row[assignment.col] = assignment.value;
        }
        changes++;
      }
      this.params = savedParams;
      return { meta: { changes } };
    }
    m = this.sql.match(/^DELETE FROM (\w+) WHERE (.+)$/i);
    if (m) {
      const table = this.db.table(m[1]);
      const before = table.length;
      const kept = table.filter((row) => !this.matchConds(row, m[2]));
      this.db.tables[m[1]] = kept;
      return { meta: { changes: before - kept.length } };
    }
    throw new Error('Unsupported statement: ' + this.sql);
  }
}

export class ShimDB {
  constructor() {
    this.tables = {};
  }

  table(name) {
    if (!this.tables[name]) this.tables[name] = [];
    return this.tables[name];
  }

  prepare(sql) {
    return new ShimStmt(this, sql);
  }

  async batch(statements) {
    const results = [];
    for (const stmt of statements) results.push(await stmt.run());
    return results;
  }

  insert(tableName, row) {
    this.table(tableName).push(row);
  }
}
