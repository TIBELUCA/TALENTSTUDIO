CREATE TABLE "activity_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"salesman_user_id" integer,
	"dealer_user_id" integer,
	"performed_by" text NOT NULL,
	"action" text NOT NULL,
	"offer_id" integer,
	"offer_reference" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_feedback" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"rating" text NOT NULL,
	"feedback_type" text DEFAULT 'overall' NOT NULL,
	"field_key" text,
	"original_value" text,
	"modified_value" text,
	"score" integer,
	"comment" text,
	"submitted_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"workflow" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"input" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"output" jsonb,
	"error" text,
	"model" text NOT NULL,
	"provider" text,
	"prompt_tokens" integer,
	"completion_tokens" integer,
	"duration_ms" integer,
	"triggered_by" text NOT NULL,
	"entity_type" text,
	"entity_id" integer,
	"offer_id" integer,
	"enquiry_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "bank_accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"connection_id" integer NOT NULL,
	"provider_account_id" text NOT NULL,
	"bank_name" text,
	"account_name" text,
	"iban" text,
	"currency" text,
	"account_type" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bank_balance_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"bank_account_id" integer NOT NULL,
	"current_balance" numeric(18, 2),
	"available_balance" numeric(18, 2),
	"currency" text,
	"fetched_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bank_connections" (
	"id" serial PRIMARY KEY NOT NULL,
	"provider" text DEFAULT 'truelayer' NOT NULL,
	"user_id" integer NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text,
	"token_expiry" timestamp,
	"status" text DEFAULT 'active' NOT NULL,
	"provider_user_reference" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bank_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"bank_account_id" integer NOT NULL,
	"provider_transaction_id" text,
	"transaction_date" timestamp,
	"amount" numeric(18, 2),
	"currency" text,
	"description" text,
	"reference" text,
	"counterparty_name" text,
	"raw_payload" jsonb,
	"fetched_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"logo_url" text,
	"email" text,
	"website" text,
	"address" text,
	"phone" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" integer NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"contact_role" text[],
	"contact_status" text,
	"email" text,
	"mobile" text,
	"fax" text,
	"office_phone" text,
	"date_of_birth" text,
	"language" text,
	"newsletter_block" text,
	"description" text,
	"commercial" text,
	"expiring_date_sales" text,
	"newsletter" text,
	"unsubscribe_date" text,
	"profiling" text,
	"expiring_date_profiling" text,
	"privacy_acknowledged" text,
	"anonymized" text,
	"address" text,
	"city" text,
	"postal_code" text,
	"country" text,
	"region" text,
	"district" text,
	"company" text,
	"salesman_id" integer,
	"source_of_contact" text,
	"exhibition_year" text,
	"exhibition_name" text,
	"area_of_interest" text,
	"area_of_interest_description" text,
	"last_call" text,
	"next_recall" text,
	"tipo" text,
	"n_marketing" text,
	"conversion_date" text,
	"is_external_record" text,
	"phone" text,
	"role" text,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"created_by" text,
	"updated_at" timestamp DEFAULT now(),
	"updated_by" text
);
--> statement-breakpoint
CREATE TABLE "custom_machine_options" (
	"id" serial PRIMARY KEY NOT NULL,
	"custom_machine_id" integer NOT NULL,
	"name" text NOT NULL,
	"price" numeric(10, 2) DEFAULT '0' NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "custom_machines" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"base_price" numeric(10, 2) DEFAULT '0' NOT NULL,
	"image_url" text,
	"detail_images" jsonb,
	"created_by" integer,
	"created_by_name" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer,
	"name" text NOT NULL,
	"customer_code" text,
	"account_status" text,
	"structure" text,
	"related_account" text,
	"language" text,
	"type" text,
	"description" text,
	"email" text,
	"contact_person" text,
	"address" text,
	"postal_code" text,
	"city" text,
	"country" text,
	"region" text,
	"province" text,
	"office_phone" text,
	"fax" text,
	"pec" text,
	"web_site" text,
	"fiscal_code" text,
	"vat_number" text,
	"public_admin_code" text,
	"insolved" text,
	"company" text,
	"dealer_id" integer,
	"salesman_id" integer,
	"customer_category" text[],
	"material_type" text[],
	"industry" text[],
	"size" text,
	"sales" text,
	"abc_analysis" text,
	"group_abc_analysis" text,
	"machine_family" text,
	"notes" text,
	"conversion_date" text,
	"directory_id" text,
	"merged_into_id" integer,
	"created_at" timestamp DEFAULT now(),
	"created_by" text,
	"updated_at" timestamp DEFAULT now(),
	"updated_by" text
);
--> statement-breakpoint
CREATE TABLE "dealer_companies" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer,
	"company_name" text NOT NULL,
	"address" text DEFAULT '' NOT NULL,
	"vat_number" text DEFAULT '' NOT NULL,
	"state" text DEFAULT '' NOT NULL,
	"city" text DEFAULT '',
	"postal_code" text DEFAULT '',
	"email" text DEFAULT '',
	"phone" text DEFAULT '',
	"notes" text DEFAULT '',
	"linked_salesman_id" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"doc_logo_url" text,
	"doc_footer_lines" jsonb,
	"doc_terms_text" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dealer_login_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"dealer_id" integer NOT NULL,
	"logged_in_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dealer_presets" (
	"id" serial PRIMARY KEY NOT NULL,
	"dealer_company_id" integer NOT NULL,
	"type" text DEFAULT 'general' NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"content" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dealer_users" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer,
	"dealer_company_id" integer,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"name" text NOT NULL,
	"surname" text DEFAULT '' NOT NULL,
	"mobile_number" text DEFAULT '',
	"role" text DEFAULT '',
	"is_active" boolean DEFAULT true NOT NULL,
	"linked_salesman_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "dealer_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "email_connections" (
	"id" serial PRIMARY KEY NOT NULL,
	"salesman_user_id" integer,
	"dealer_user_id" integer,
	"provider" text NOT NULL,
	"provider_account_email" text,
	"access_token" text NOT NULL,
	"refresh_token" text,
	"token_expiry" timestamp,
	"scopes" text,
	"is_default" boolean DEFAULT false,
	"sender_display_name" text,
	"signature" text,
	"connected_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_send_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"salesman_user_id" integer,
	"dealer_user_id" integer,
	"provider" text NOT NULL,
	"recipient" text NOT NULL,
	"cc" text,
	"subject" text NOT NULL,
	"offer_id" integer,
	"job_order_id" integer,
	"customer_id" integer,
	"interaction_id" integer,
	"sent_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "enquiry_attachments" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer,
	"enquiry_id" integer NOT NULL,
	"filename" text NOT NULL,
	"original_name" text NOT NULL,
	"mimetype" text NOT NULL,
	"size" integer NOT NULL,
	"uploaded_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "enquiry_sequence" (
	"id" serial PRIMARY KEY NOT NULL,
	"last_sequence" integer DEFAULT 0 NOT NULL,
	"year" integer NOT NULL,
	CONSTRAINT "enquiry_sequence_year_unique" UNIQUE("year")
);
--> statement-breakpoint
CREATE TABLE "interactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer,
	"customer_id" integer NOT NULL,
	"contact_id" integer,
	"salesman_user_id" integer,
	"dealer_user_id" integer,
	"date" timestamp NOT NULL,
	"direction" text NOT NULL,
	"type" text NOT NULL,
	"classification" text,
	"notes" text,
	"location" text,
	"additional_contact_ids" jsonb,
	"reminders" jsonb,
	"send_email" boolean DEFAULT false,
	"auto_generated" boolean DEFAULT false,
	"linked_offer_id" integer,
	"linked_enquiry_id" integer,
	"linked_job_order_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_order_documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"job_order_id" integer NOT NULL,
	"filename" text NOT NULL,
	"original_name" text NOT NULL,
	"mime_type" text,
	"description" text,
	"uploaded_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_order_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"job_order_id" integer NOT NULL,
	"version_number" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"modified_by_user_id" integer,
	"modified_by_name" text,
	"change_notes" text,
	"change_summary" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer,
	"job_number" text NOT NULL,
	"offer_id" integer,
	"customer_id" integer,
	"contact_ids" jsonb,
	"status" text DEFAULT 'active' NOT NULL,
	"notes" text,
	"responsible_user_id" integer,
	"layout_pdf_filename" text,
	"layout_pdf_original_name" text,
	"order_confirmation_filename" text,
	"order_confirmation_original_name" text,
	"settore" text DEFAULT 'Legno',
	"job_code" text,
	"agent_info" jsonb,
	"billing_info" jsonb,
	"shipping_info" jsonb,
	"delivery_date" timestamp,
	"assembly_date" timestamp,
	"testing_date" timestamp,
	"payment_terms" jsonb,
	"bank_name" text,
	"order_items" jsonb,
	"additional_items" jsonb,
	"price_summary" jsonb,
	"shipping_terms" jsonb,
	"line_technical_data" jsonb,
	"technical_sheets" jsonb,
	"logistics" jsonb,
	"manual_form_data" jsonb,
	"section_comments" jsonb,
	"offer_history" jsonb,
	"invoicing" jsonb,
	"production_progress" jsonb,
	"audit_log" jsonb,
	"current_version" integer DEFAULT 1 NOT NULL,
	"last_modified_by_user_id" integer,
	"confirmation_status" text DEFAULT 'pending' NOT NULL,
	"confirmation_comment" text,
	"confirmed_by_user_id" integer,
	"confirmed_at" timestamp,
	"deleted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "job_orders_job_number_unique" UNIQUE("job_number")
);
--> statement-breakpoint
CREATE TABLE "machine_options" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer,
	"machine_id" integer NOT NULL,
	"seq_num" integer,
	"name" text NOT NULL,
	"description" text,
	"titles" jsonb,
	"descriptions" jsonb,
	"price_modifier" numeric(10, 2) NOT NULL,
	"electrical_power" numeric(10, 2),
	"compressed_air" numeric(10, 2),
	"exhausted_air" numeric(10, 2),
	"air_introduced" numeric(10, 2)
);
--> statement-breakpoint
CREATE TABLE "machine_usage_stats" (
	"id" serial PRIMARY KEY NOT NULL,
	"machine_id" integer NOT NULL,
	"machine_name" text NOT NULL,
	"macro_type" text,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"avg_price" numeric(12, 2),
	"avg_quantity" numeric(8, 2),
	"total_revenue" numeric(14, 2),
	"last_used_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "machines" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer,
	"seq_num" integer,
	"machine_code" text,
	"macro_type" text,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"titles" jsonb,
	"descriptions" jsonb,
	"image_url" text,
	"base_price" numeric(10, 2) NOT NULL,
	"electrical_power" numeric(10, 2),
	"compressed_air" numeric(10, 2),
	"exhausted_air" numeric(10, 2),
	"air_introduced" numeric(10, 2),
	"installation_days" numeric(8, 2),
	"source" text DEFAULT 'excel',
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer,
	"recipient_user_id" integer NOT NULL,
	"sender_user_id" integer,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"message" text DEFAULT '' NOT NULL,
	"order_id" integer,
	"is_read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "offer_embeddings" (
	"id" serial PRIMARY KEY NOT NULL,
	"offer_id" integer NOT NULL,
	"embedding" jsonb NOT NULL,
	"machine_reference" text NOT NULL,
	"options_summary" text NOT NULL,
	"textual_summary" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "offer_item_options" (
	"id" serial PRIMARY KEY NOT NULL,
	"offer_item_id" integer NOT NULL,
	"machine_option_id" integer NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"snapshot_option_name" text NOT NULL,
	"snapshot_option_titles" jsonb,
	"snapshot_option_descriptions" jsonb,
	"snapshot_price_modifier" numeric(10, 2) NOT NULL,
	"snapshot_electrical_power" numeric(10, 2),
	"snapshot_compressed_air" numeric(10, 2),
	"snapshot_exhausted_air" numeric(10, 2),
	"snapshot_air_introduced" numeric(10, 2)
);
--> statement-breakpoint
CREATE TABLE "offer_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer,
	"offer_id" integer NOT NULL,
	"machine_id" integer NOT NULL,
	"position" integer DEFAULT 1 NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"snapshot_machine_name" text NOT NULL,
	"snapshot_machine_description" text,
	"snapshot_titles" jsonb,
	"snapshot_descriptions" jsonb,
	"snapshot_base_price" numeric(10, 2) NOT NULL,
	"snapshot_macro_type" text,
	"snapshot_image_url" text,
	"snapshot_electrical_power" numeric(10, 2),
	"snapshot_compressed_air" numeric(10, 2),
	"snapshot_exhausted_air" numeric(10, 2),
	"snapshot_air_introduced" numeric(10, 2),
	"snapshot_installation_days" numeric(8, 2)
);
--> statement-breakpoint
CREATE TABLE "offer_patterns" (
	"id" serial PRIMARY KEY NOT NULL,
	"pattern_type" text NOT NULL,
	"pattern_data" jsonb NOT NULL,
	"frequency" integer DEFAULT 1 NOT NULL,
	"confidence" numeric(5, 4),
	"last_seen_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "offer_sequence" (
	"id" serial PRIMARY KEY NOT NULL,
	"last_sequence" integer DEFAULT 0 NOT NULL,
	"year" integer NOT NULL,
	CONSTRAINT "offer_sequence_year_unique" UNIQUE("year")
);
--> statement-breakpoint
CREATE TABLE "offers" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer,
	"reference_number" text NOT NULL,
	"customer_id" integer NOT NULL,
	"date" timestamp DEFAULT now() NOT NULL,
	"subject" text NOT NULL,
	"salesman_name" text NOT NULL,
	"salesman_email" text,
	"salesman_mobile" text,
	"salesman_user_id" integer,
	"project_data" jsonb,
	"status" text DEFAULT 'Draft' NOT NULL,
	"total_price" numeric(12, 2) NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"parent_offer_id" integer,
	"deleted_at" timestamp,
	"offer_type" text DEFAULT 'offer' NOT NULL,
	"dealer_id" integer,
	"source_enquiry_id" integer,
	"source_offer_id" integer,
	"shared_by_user_id" integer,
	"claimed_by_user_id" integer,
	"claimed_at" timestamp,
	"forwarded_by_user_id" integer,
	"origin_dealer_id" integer,
	"origin_enquiry_id" integer,
	"language" text DEFAULT 'it' NOT NULL,
	CONSTRAINT "offers_reference_number_unique" UNIQUE("reference_number")
);
--> statement-breakpoint
CREATE TABLE "option_usage_stats" (
	"id" serial PRIMARY KEY NOT NULL,
	"machine_option_id" integer NOT NULL,
	"option_name" text NOT NULL,
	"machine_id" integer NOT NULL,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"co_occurrence_option_ids" jsonb,
	"avg_quantity" numeric(8, 2),
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "presets" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer,
	"type" text DEFAULT 'general' NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"content" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pricing_distributions" (
	"id" serial PRIMARY KEY NOT NULL,
	"machine_id" integer NOT NULL,
	"machine_name" text NOT NULL,
	"macro_type" text,
	"min_price" numeric(12, 2),
	"max_price" numeric(12, 2),
	"avg_price" numeric(12, 2),
	"median_price" numeric(12, 2),
	"sample_count" integer DEFAULT 0 NOT NULL,
	"price_buckets" jsonb,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "production_facilities" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" integer NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"postal_code" text,
	"city" text,
	"country" text,
	"region" text,
	"province" text,
	"phone" text,
	"email" text,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"created_by" text,
	"updated_at" timestamp DEFAULT now(),
	"updated_by" text
);
--> statement-breakpoint
CREATE TABLE "sales_insights" (
	"id" serial PRIMARY KEY NOT NULL,
	"insight_type" text NOT NULL,
	"insight_data" jsonb NOT NULL,
	"confidence" numeric(5, 4),
	"computed_at" timestamp DEFAULT now() NOT NULL,
	"valid_until" timestamp
);
--> statement-breakpoint
CREATE TABLE "salesman_login_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"salesman_user_id" integer NOT NULL,
	"login_at" timestamp DEFAULT now() NOT NULL,
	"device_info" text,
	"ip_address" text
);
--> statement-breakpoint
CREATE TABLE "salesman_users" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"name" text NOT NULL,
	"surname" text DEFAULT '' NOT NULL,
	"mobile_number" text DEFAULT '',
	"is_active" boolean DEFAULT true NOT NULL,
	"is_master_salesman" boolean DEFAULT false NOT NULL,
	"role" text DEFAULT 'salesman' NOT NULL,
	"parent_salesman_id" integer,
	"features" jsonb DEFAULT '{"canCreateOffers":true,"canEditOffers":true,"canDeleteOffers":false,"canManageCustomers":true,"canViewMachines":true,"canViewPresets":true,"canUseFormat":false,"canManageSpecialMachines":false}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "salesman_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"company_id" integer,
	"value" jsonb
);
--> statement-breakpoint
CREATE TABLE "share_attachments" (
	"id" serial PRIMARY KEY NOT NULL,
	"message_id" integer NOT NULL,
	"filename" text NOT NULL,
	"original_name" text NOT NULL,
	"mimetype" text NOT NULL,
	"size" integer NOT NULL,
	"uploaded_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "share_conversations" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer,
	"subject" text NOT NULL,
	"created_by_type" text NOT NULL,
	"created_by_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "share_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversation_id" integer NOT NULL,
	"sender_type" text NOT NULL,
	"sender_id" integer NOT NULL,
	"body" text,
	"shared_offer_id" integer,
	"shared_enquiry_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "share_participants" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversation_id" integer NOT NULL,
	"participant_type" text NOT NULL,
	"participant_id" integer NOT NULL,
	"last_read_at" timestamp,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"sid" varchar PRIMARY KEY NOT NULL,
	"sess" jsonb NOT NULL,
	"expire" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar,
	"first_name" varchar,
	"last_name" varchar,
	"profile_image_url" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "ai_feedback" ADD CONSTRAINT "ai_feedback_run_id_ai_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."ai_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "IDX_session_expire" ON "sessions" USING btree ("expire");