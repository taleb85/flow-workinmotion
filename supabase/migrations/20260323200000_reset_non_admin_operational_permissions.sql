-- Allinea i permessi operativi: solo `admin` ha tutti i flag a true; gli altri ruoli a false.

UPDATE public.users
SET
  can_create_shifts = (role = 'admin'),
  can_approve_shifts = (role = 'admin'),
  can_manage_drafts = (role = 'admin'),
  can_view_total_hours = (role = 'admin'),
  can_edit_staff_pins = (role = 'admin');
