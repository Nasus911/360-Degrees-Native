create table if not exists public.identity_verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  document_type text not null check (document_type = 'philippine_national_id'),
  status text not null default 'awaiting_id'
    check (status in (
      'awaiting_id',
      'id_uploaded',
      'id_scan_failed',
      'id_scan_passed',
      'face_uploaded',
      'face_match_failed',
      'face_match_passed',
      'submitted'
    )),
  consent_version text not null,
  consented_at timestamptz not null default now(),
  id_object_path text,
  selfie_object_path text,
  extracted_fields jsonb,
  reviewed_fields jsonb,
  scan_issues text[] not null default '{}',
  match_issues text[] not null default '{}',
  cleanup_pending boolean not null default false,
  expires_at timestamptz not null default (now() + interval '1 day'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists identity_verifications_user_created_idx
  on public.identity_verifications(user_id, created_at desc);
create index if not exists identity_verifications_expiry_idx
  on public.identity_verifications(expires_at)
  where status <> 'submitted';

alter table public.identity_verifications enable row level security;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'identity-verification',
  'identity-verification',
  false,
  12582912,
  array['image/jpeg', 'image/png']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Owners upload identity verification images" on storage.objects;
create policy "Owners upload identity verification images"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'identity-verification'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Owners delete identity verification images" on storage.objects;
create policy "Owners delete identity verification images"
on storage.objects for delete to authenticated
using (
  bucket_id = 'identity-verification'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Deliberately no client table read/write policies; the authenticated API uses the service role.
