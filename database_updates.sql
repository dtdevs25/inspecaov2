-- Migration script for Projects module upgrade
-- Target: PostgreSQL 14.5

-- 1. Add missing columns to Project table
ALTER TABLE "public"."Project" 
ADD COLUMN IF NOT EXISTS "unitId" text,
ADD COLUMN IF NOT EXISTS "unitName" text,
ADD COLUMN IF NOT EXISTS "sourceId" text,
ADD COLUMN IF NOT EXISTS "sourceName" text,
ADD COLUMN IF NOT EXISTS "typeId" text,
ADD COLUMN IF NOT EXISTS "typeName" text,
ADD COLUMN IF NOT EXISTS "observations" text,
ADD COLUMN IF NOT EXISTS "image" text,
ADD COLUMN IF NOT EXISTS "responsible" text,
ADD COLUMN IF NOT EXISTS "updatedAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP;

-- 2. Optional: If you want to change 'budget' to a numeric type (currently text in your dump)
-- ALTER TABLE "public"."Project" ALTER COLUMN "budget" TYPE numeric USING (NULLIF("budget", '')::numeric);

-- 3. Optional: If you want to change 'startDate' and 'endDate' to timestamp/date types
-- ALTER TABLE "public"."Project" ALTER COLUMN "startDate" TYPE date USING (NULLIF("startDate", '')::date);
-- ALTER TABLE "public"."Project" ALTER COLUMN "endDate" TYPE date USING (NULLIF("endDate", '')::date);

-- Note: The frontend uses the following mapping:
-- 'estimatedCost' maps to 'budget'
-- 'deadline' maps to 'endDate'
-- 'description' maps to 'description'
-- 'name' maps to 'name'
