CREATE TABLE "application_memory_facts" (
  "user_id" uuid NOT NULL REFERENCES "profiles"("id") ON DELETE CASCADE,
  "key" text NOT NULL,
  "value" text,
  "source" text NOT NULL DEFAULT 'profile',
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("user_id", "key"),
  CONSTRAINT "application_memory_key_check" CHECK ("key" IN ('fullName','firstName','lastName','email','phone','location','school','major','degree','gradYear','gpa','linkedinUrl','githubUrl','portfolioUrl')),
  CONSTRAINT "application_memory_value_length" CHECK (length("value") <= 500),
  CONSTRAINT "application_memory_source_check" CHECK ("source" IN ('profile','application'))
);--> statement-breakpoint
ALTER TABLE "application_memory_facts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "own_application_memory" ON "application_memory_facts"
  FOR ALL TO authenticated USING ((select auth.uid()) = "user_id") WITH CHECK ((select auth.uid()) = "user_id");
