-- SUPABASE DATABASE SCHEMA MIGRATION
-- Paste this script into the SQL Editor of your Supabase project (nwkuqgyurikqsojvosyr)

-- 1. APPOINTMENTS TABLE
create table if not exists public.appointments (
    id uuid default gen_random_uuid() primary key,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    name text not null,
    mobile_number text not null,
    service text not null,
    preferred_date date not null,
    preferred_time text not null,
    message text,
    status text default 'Pending' not null,
    confirmed_at timestamp with time zone,
    constraint appointments_status_check check (status in ('Pending', 'Confirmed', 'Completed', 'Cancelled'))
);

-- Ensure confirmed_at is a normal TIMESTAMP column (drop generated version if exists)
alter table public.appointments drop column if exists confirmed_at;
alter table public.appointments add column confirmed_at timestamp with time zone;

-- Enable RLS for Appointments
alter table public.appointments enable row level security;

-- Create Policies for Appointments
drop policy if exists "Allow public insertions for booking" on public.appointments;
create policy "Allow public insertions for booking" 
on public.appointments for insert 
with check (true);

drop policy if exists "Allow authenticated admin read access" on public.appointments;
create policy "Allow authenticated admin read access" 
on public.appointments for select 
using (auth.role() = 'authenticated');

drop policy if exists "Allow authenticated admin write access" on public.appointments;
create policy "Allow authenticated admin write access" 
on public.appointments for all 
using (auth.role() = 'authenticated');


-- 2. REVIEWS TABLE
create table if not exists public.reviews (
    id uuid default gen_random_uuid() primary key,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    name text not null,
    mobile_number text, -- Saved for guests, never displayed publicly
    photo text, -- Google Profile photo url or null
    service text not null,
    rating integer not null check (rating >= 1 and rating <= 5),
    comment text not null,
    image text, -- Optional base64 uploaded image URL
    verified boolean default false not null, -- True if Google user
    helpful integer default 0 not null, -- Upvote / Like count
    status text default 'approved' not null, -- Default to approved so it is visible instantly
    replies jsonb default '[]'::jsonb not null,
    pinned boolean default false not null,
    featured boolean default false not null,
    constraint reviews_status_check check (status in ('pending', 'approved', 'rejected'))
);

-- Ensure columns exist if reviews table already existed
alter table public.reviews add column if not exists mobile_number text;
alter table public.reviews add column if not exists pinned boolean default false not null;
alter table public.reviews add column if not exists featured boolean default false not null;

-- Enable RLS for Reviews
alter table public.reviews enable row level security;

-- Create Policies for Reviews
drop policy if exists "Allow public select for approved reviews" on public.reviews;
create policy "Allow public select for approved reviews" 
on public.reviews for select 
using (status = 'approved');

drop policy if exists "Allow public insertions for reviews" on public.reviews;
create policy "Allow public insertions for reviews" 
on public.reviews for insert 
with check (true);

drop policy if exists "Allow public upvote updates" on public.reviews;
create policy "Allow public upvote updates" 
on public.reviews for update 
using (true)
with check (true);

drop policy if exists "Allow authenticated admin write operations" on public.reviews;
create policy "Allow authenticated admin write operations" 
on public.reviews for all 
using (auth.role() = 'authenticated');


-- 3. GALLERY TABLE
create table if not exists public.gallery (
    id uuid default gen_random_uuid() primary key,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    url text not null, -- Stores image URL or base64 image data
    caption text,
    category text not null, -- haircut, hairstyle, man face wash, man hair colour
    featured boolean default false not null
);

-- Enable RLS for Gallery
alter table public.gallery enable row level security;

-- Create Policies for Gallery
drop policy if exists "Allow public select for gallery" on public.gallery;
create policy "Allow public select for gallery" 
on public.gallery for select 
using (true);

drop policy if exists "Allow authenticated admin write access for gallery" on public.gallery;
create policy "Allow authenticated admin write access for gallery" 
on public.gallery for all 
using (auth.role() = 'authenticated');


-- 4. CONTACT MESSAGES TABLE
create table if not exists public.contacts (
    id uuid default gen_random_uuid() primary key,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    name text not null,
    phone text not null,
    message text not null,
    status text default 'unread' not null,
    constraint contacts_status_check check (status in ('unread', 'read'))
);

-- Enable RLS for Contacts
alter table public.contacts enable row level security;

-- Create Policies for Contacts
drop policy if exists "Allow public insertion for contacts" on public.contacts;
create policy "Allow public insertion for contacts" 
on public.contacts for insert 
with check (true);

drop policy if exists "Allow authenticated admin read/write access for contacts" on public.contacts;
create policy "Allow authenticated admin read/write access for contacts" 
on public.contacts for all 
using (auth.role() = 'authenticated');


-- 5. PROFILES TABLE
create table if not exists public.profiles (
    id uuid references auth.users on delete cascade primary key,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    full_name text,
    avatar_url text,
    role text default 'customer' not null
);

-- Enable RLS for Profiles
alter table public.profiles enable row level security;

-- Create Policies for Profiles
drop policy if exists "Allow public select for profiles" on public.profiles;
create policy "Allow public select for profiles" 
on public.profiles for select 
using (true);

drop policy if exists "Allow users to update own profile" on public.profiles;
create policy "Allow users to update own profile" 
on public.profiles for update 
using (auth.uid() = id);

drop policy if exists "Allow authenticated admin all access for profiles" on public.profiles;
create policy "Allow authenticated admin all access for profiles" 
on public.profiles for all 
using (auth.role() = 'authenticated');


-- 5. MOCK DATA FOR SEEDING REVIEWS (Approved by default)
insert into public.reviews (name, photo, service, rating, comment, verified, helpful, status, replies, pinned, featured)
values 
('অনির্দিষ্ট গ্রাহক', 'https://lh3.googleusercontent.com/a/default-user=s120', 'Combo Pack', 5, 'অসাধারণ সার্ভিস! দেবব্রত বাবুর হাতের কাজ সত্যিই প্রশংসনীয়। পরিবেশ খুবই শান্ত ও পরিচ্ছন্ন।', true, 8, 'approved', '["অনেক ধন্যবাদ অনির্বাণ বাবু! আপনার সেবা করতে পেরে আমরা আনন্দিত।"]'::jsonb, true, true),
('সন্দীপন দাস', null, 'Haircut & Styling', 5, 'খুবই পরিচ্ছন্ন পরিবেশ এবং আধুনিক স্টাইলের চুল কাটার জন্য তমলুকের সেরা জায়গা।', false, 5, 'approved', '["আপনার মূল্যবান মতামতের জন্য ধন্যবাদ সন্দীপন বাবু। আমরা সর্বদা সেরা মানের সেবা দেওয়ার চেষ্টা করি।"]'::jsonb, false, false),
('রাহুল রায়', null, 'Face Clean-up', 5, 'ব্যবহার খুব ভালো এবং কাজের মান অত্যন্ত উন্নত। আমি সবাইকে এখানে আসার পরামর্শ দেব।', false, 3, 'approved', '[]'::jsonb, false, false)
on conflict do nothing;


-- 6. MOCK DATA FOR GALLERY IMAGES
insert into public.gallery (url, caption, category, featured)
values 
('gallery/haircut.png', 'প্রিমিয়াম চুল কাটা', 'haircut', true),
('gallery/hairstyle.png', 'আধুনিক হেয়ারস্টাইল', 'hairstyle', true),
('gallery/facewash.png', 'ফেস ওয়াশ ট্রিটমেন্ট', 'facewash', true),
('gallery/haircolour.png', 'চুল কালারিং', 'haircolour', true)
on conflict do nothing;


-- =======================================================
-- 7. REALTIME REPLICATION CONFIGURATION
-- =======================================================
-- Run these commands to add your tables to the supabase_realtime publication
-- to receive database events in real-time in the admin dashboard.

do $$
begin
  -- appointments
  if not exists (
    select 1 from pg_publication_tables 
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'appointments'
  ) then
    alter publication supabase_realtime add table public.appointments;
  end if;
  
  -- reviews
  if not exists (
    select 1 from pg_publication_tables 
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'reviews'
  ) then
    alter publication supabase_realtime add table public.reviews;
  end if;

  -- gallery
  if not exists (
    select 1 from pg_publication_tables 
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'gallery'
  ) then
    alter publication supabase_realtime add table public.gallery;
  end if;

  -- contacts
  if not exists (
    select 1 from pg_publication_tables 
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'contacts'
  ) then
    alter publication supabase_realtime add table public.contacts;
  end if;
end $$;


-- =======================================================
-- 8. SECURE ADMIN USER TRIGGERS (SINGLE-SLOT FLOW)
-- =======================================================

-- Trigger function before user is inserted to auto-confirm email only for the first account
create or replace function public.auto_confirm_first_user()
returns trigger as $$
declare
  user_count integer;
begin
  -- Count how many users exist in auth.users
  select count(*) into user_count from auth.users;

  -- If this is the first user ever registered, auto-confirm their email address
  if user_count = 0 then
    new.email_confirmed_at := now();
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created_before on auth.users;
create trigger on_auth_user_created_before
  before insert on auth.users
  for each row execute procedure public.auto_confirm_first_user();


-- Trigger function after user is inserted to assign the admin role to the first profile only
create or replace function public.handle_new_user()
returns trigger as $$
declare
  admin_count integer;
begin
  -- Count how many admin profiles currently exist
  select count(*) into admin_count from public.profiles where role = 'admin';

  -- If no admin exists yet, make this first registered profile the admin
  if admin_count = 0 then
    insert into public.profiles (id, full_name, role)
    values (
      new.id,
      coalesce(new.raw_user_meta_data->>'full_name', 'দেবব্রত মান্না (মালিক)'),
      'admin'
    )
    on conflict (id) do update set role = 'admin';
  else
    -- All other future signups default to standard customer role
    insert into public.profiles (id, full_name, role)
    values (
      new.id,
      coalesce(new.raw_user_meta_data->>'full_name', 'গ্রাহক'),
      'customer'
    );
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created_after on auth.users;
create trigger on_auth_user_created_after
  after insert on auth.users
  for each row execute procedure public.handle_new_user();


-- Enforce at most ONE admin profile in the entire system via a partial unique index
create unique index if not exists unique_admin_role on public.profiles (role) where (role = 'admin');


-- Make sure existing admin user (if any) is confirmed, has the correct password (Pra623), and has admin profile role
update auth.users 
set email_confirmed_at = now(),
    encrypted_password = extensions.crypt('Pra623', extensions.gen_salt('bf', 10))
where email = 'admin@salon.com';

insert into public.profiles (id, full_name, role)
select id, 'দেবব্রত মান্না (মালিক)', 'admin'
from auth.users
where email = 'admin@salon.com'
on conflict (id) do update set role = 'admin';


-- =======================================================
-- TROUBLESHOOTING & RESETTING THE ADMIN SLOT
-- =======================================================
-- If you are locked out or seeing "wrong password", you can open the single admin registration slot again
-- by running the following SQL commands in your Supabase SQL Editor. This will safely clear existing users
-- and profiles, allowing you to register a fresh admin account directly from the browser:
--
-- DELETE FROM public.profiles;
-- DELETE FROM auth.users;
--
-- After running the DELETE commands above:
-- 1. Refresh your browser at http://localhost:8000/admin/
-- 2. You will see the "Create Admin Account" form.
-- 3. Register your email (admin@salon.com) and password (Pra623) there.
-- 4. Once registered, the page will switch back to the login screen and lock the slot.

