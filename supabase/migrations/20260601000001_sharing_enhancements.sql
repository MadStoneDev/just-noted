-- Anonymous sharing: hide author info on shared page
ALTER TABLE shared_notes ADD COLUMN IF NOT EXISTS is_anonymous BOOLEAN DEFAULT false;

-- Password protection: bcrypt hash of the password
ALTER TABLE shared_notes ADD COLUMN IF NOT EXISTS password_hash TEXT;
