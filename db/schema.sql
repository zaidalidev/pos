-- ShopOnClick / DukanOnClick — Neon schema + RLS
-- Run this once in Neon Console → SQL Editor (same project as Auth + Data API).
-- Then: Neon Console → Data API → ensure Managed Better Auth is linked.

-- Roles used by Neon Data API (created when Data API is enabled)
GRANT USAGE ON SCHEMA public TO authenticated, anonymous;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;

CREATE TABLE IF NOT EXISTS public.shops (
  id text PRIMARY KEY,
  name text NOT NULL,
  phone text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  city text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Suspended')),
  plan text NOT NULL DEFAULT 'Starter' CHECK (plan IN ('Starter', 'Business', 'Professional')),
  monthly_fee integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.profiles (
  id text PRIMARY KEY,
  auth_id text UNIQUE,
  name text NOT NULL,
  email text NOT NULL,
  phone text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT 'Owner'
    CHECK (role IN ('Owner', 'Manager', 'Cashier', 'Staff')),
  status text NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive')),
  shop_id text REFERENCES public.shops (id) ON DELETE SET NULL,
  is_platform_admin boolean NOT NULL DEFAULT false,
  last_login timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS profiles_email_lower_idx
  ON public.profiles (lower(email));

CREATE INDEX IF NOT EXISTS profiles_shop_id_idx ON public.profiles (shop_id);
CREATE INDEX IF NOT EXISTS profiles_auth_id_idx ON public.profiles (auth_id);

CREATE TABLE IF NOT EXISTS public.platform_fees (
  id text PRIMARY KEY,
  shop_id text NOT NULL REFERENCES public.shops (id) ON DELETE CASCADE,
  month text NOT NULL,
  amount integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'Pending' CHECK (status IN ('Paid', 'Pending')),
  paid_at timestamptz,
  note text,
  UNIQUE (shop_id, month)
);

CREATE TABLE IF NOT EXISTS public.shop_bags (
  shop_id text PRIMARY KEY REFERENCES public.shops (id) ON DELETE CASCADE,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Helpers (SECURITY DEFINER avoids RLS recursion when reading profiles)
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.auth_id = auth.user_id()
      AND p.is_platform_admin = true
      AND p.status = 'Active'
  );
$$;

CREATE OR REPLACE FUNCTION public.my_shop_id()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.shop_id
  FROM public.profiles p
  WHERE p.auth_id = auth.user_id()
    AND p.status = 'Active'
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.touch_shop_bag_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS shop_bags_touch_updated_at ON public.shop_bags;
CREATE TRIGGER shop_bags_touch_updated_at
  BEFORE UPDATE ON public.shop_bags
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_shop_bag_updated_at();

ALTER TABLE public.shops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_fees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shop_bags ENABLE ROW LEVEL SECURITY;

-- Shops
DROP POLICY IF EXISTS shops_select ON public.shops;
CREATE POLICY shops_select ON public.shops
  FOR SELECT TO authenticated
  USING (public.is_platform_admin() OR id = public.my_shop_id());

DROP POLICY IF EXISTS shops_insert ON public.shops;
CREATE POLICY shops_insert ON public.shops
  FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS shops_update ON public.shops;
CREATE POLICY shops_update ON public.shops
  FOR UPDATE TO authenticated
  USING (public.is_platform_admin() OR id = public.my_shop_id())
  WITH CHECK (public.is_platform_admin() OR id = public.my_shop_id());

DROP POLICY IF EXISTS shops_delete ON public.shops;
CREATE POLICY shops_delete ON public.shops
  FOR DELETE TO authenticated
  USING (public.is_platform_admin());

-- Profiles
DROP POLICY IF EXISTS profiles_select ON public.profiles;
CREATE POLICY profiles_select ON public.profiles
  FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR auth_id = auth.user_id()
    OR shop_id = public.my_shop_id()
  );

DROP POLICY IF EXISTS profiles_insert ON public.profiles;
CREATE POLICY profiles_insert ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_platform_admin()
    OR auth_id = auth.user_id()
    OR shop_id = public.my_shop_id()
  );

DROP POLICY IF EXISTS profiles_update ON public.profiles;
CREATE POLICY profiles_update ON public.profiles
  FOR UPDATE TO authenticated
  USING (
    public.is_platform_admin()
    OR auth_id = auth.user_id()
    OR shop_id = public.my_shop_id()
  )
  WITH CHECK (
    public.is_platform_admin()
    OR auth_id = auth.user_id()
    OR shop_id = public.my_shop_id()
  );

DROP POLICY IF EXISTS profiles_delete ON public.profiles;
CREATE POLICY profiles_delete ON public.profiles
  FOR DELETE TO authenticated
  USING (
    public.is_platform_admin()
    OR (shop_id = public.my_shop_id() AND auth_id IS DISTINCT FROM auth.user_id())
  );

-- Platform fees (admin only)
DROP POLICY IF EXISTS platform_fees_select ON public.platform_fees;
CREATE POLICY platform_fees_select ON public.platform_fees
  FOR SELECT TO authenticated
  USING (public.is_platform_admin());

DROP POLICY IF EXISTS platform_fees_insert ON public.platform_fees;
CREATE POLICY platform_fees_insert ON public.platform_fees
  FOR INSERT TO authenticated
  WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS platform_fees_update ON public.platform_fees;
CREATE POLICY platform_fees_update ON public.platform_fees
  FOR UPDATE TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS platform_fees_delete ON public.platform_fees;
CREATE POLICY platform_fees_delete ON public.platform_fees
  FOR DELETE TO authenticated
  USING (public.is_platform_admin());

-- Shop bags (POS / inventory JSON snapshot per shop)
DROP POLICY IF EXISTS shop_bags_select ON public.shop_bags;
CREATE POLICY shop_bags_select ON public.shop_bags
  FOR SELECT TO authenticated
  USING (public.is_platform_admin() OR shop_id = public.my_shop_id());

DROP POLICY IF EXISTS shop_bags_insert ON public.shop_bags;
CREATE POLICY shop_bags_insert ON public.shop_bags
  FOR INSERT TO authenticated
  WITH CHECK (public.is_platform_admin() OR shop_id = public.my_shop_id());

DROP POLICY IF EXISTS shop_bags_update ON public.shop_bags;
CREATE POLICY shop_bags_update ON public.shop_bags
  FOR UPDATE TO authenticated
  USING (public.is_platform_admin() OR shop_id = public.my_shop_id())
  WITH CHECK (public.is_platform_admin() OR shop_id = public.my_shop_id());

DROP POLICY IF EXISTS shop_bags_delete ON public.shop_bags;
CREATE POLICY shop_bags_delete ON public.shop_bags
  FOR DELETE TO authenticated
  USING (public.is_platform_admin() OR shop_id = public.my_shop_id());

GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated, anonymous;
GRANT EXECUTE ON FUNCTION public.my_shop_id() TO authenticated, anonymous;
