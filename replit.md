# replit.md

## Overview

Talent Studio is a talent-management system designed for influencer and creator agencies, specifically tailored for single-tenant use by Giovanna's team. It reimagines a legacy industrial-machinery quoting tool (QuotePilot) into a talent-centric platform. The system supports a 3-role agency model: Head of Talent (admin), Talent Manager, and Talent.

Key capabilities include:
- **Talent Roster**: Comprehensive management of influencer data, social media statistics, base rates, and commission percentages.
- **Brand CRM**: A customer relationship management system for brands, encompassing contacts, interactions, and a calendar.
- **Quotes & Campaigns**: Streamlined processes for generating campaign quotes and managing campaign execution, replacing the legacy industrial flows.
- **Integrated Tools**: Email client, recap functionality, and Google Drive archiving, carried over and adapted from the previous product.

The project aims to provide an all-encompassing solution for managing influencer talent, brand relationships, and campaign lifecycles efficiently.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Core Technologies
- **Frontend**: React 18, TypeScript, TanStack React Query, shadcn/ui, Tailwind CSS, Framer Motion.
- **Backend**: Node.js, Express, TypeScript, ESM modules.
- **Database**: PostgreSQL with Drizzle ORM.

### Architectural Patterns
- **API Design**: RESTful endpoints with Zod validation.
- **Backend Architecture**: Domain-based modules, centralized middleware for authentication, multi-tenancy, and error handling. Layers include Repository for data access, Service for business logic (document generation, file storage, external integrations), and a dedicated AI Service layer.
- **Multi-tenancy**: Implemented using `companyId` across all core database tables.
- **UI/UX Architecture**: Emphasizes a "zero overlays" policy, global back navigation, and reusable selection patterns for lists.

### Key Features and Design Decisions

#### Talent Management
- **Schema**: Dedicated schemas for `talents`, `talent_socials`, `talent_rates`, and `talent_documents`, all multi-tenant.
- **Backend**: CRUD operations via `talentsRouter` with role-based access control.
- **UI**: Grid roster with search/filter, forms for creation/editing, and detailed talent profiles with placeholders for campaign history and performance.

#### Talent Quotes & Campaigns
- **Goal**: Introduce new talent-specific quote (`talent_quotes`, `talent_quote_items`) and campaign (`campaigns`, `campaign_deliverables`, `deliverable_metrics`, `campaign_payments_in`, `campaign_payments_out`) schemas, coexisting with but separate from legacy structures.
- **Backend**: Repositories for quotes and campaigns, dedicated routes for CRUD, status updates, duplication, and PDF generation. Includes aggregate endpoints for talent performance history.
- **PDF Generation**: Server-side PDF generation for talent quotes using Puppeteer.
- **Activity Logging**: Extensive logging of quote and campaign lifecycle events for timeline views.
- **Frontend**: Wizards for quote creation, detailed quote/campaign pages, and integration with talent profiles for historical data. Legacy routes redirect to new talent-specific paths.

#### CRM Module
- **Comprehensive Management**: Manages Companies, Contacts, Interactions, and Calendar.
- **Profiles**: Detailed tabbed layouts for company and contact information.
- **Data Handling**: Excel import/export functionality.

#### Order Management
- **Internal Order System**: Generates internal order documents from accepted offers.
- **Order Structure**: Comprehensive fields for billing, shipping, payments, and logistics.
- **Order PDF Generation**: Generates internal order PDFs using Puppeteer.
- **AI Integration**: AI Vision PDF extraction for automated data entry in manual orders.
- **Data Integrity**: Soft-deletion and versioning for all order modifications.

#### Drawings Module
- **Technical Drawing Library**: CRUD for technical drawings with PDF and DWG attachments.
- **Request System**: Salesmen can request drawings from technical commercial users.
- **Version Control**: Per-job-order versioning for drawings with replacement tracking.
- **AI Extraction**: AI-powered text extraction from PDFs to identify machine names.

#### User and Access Management
- **Authentication**: Email/password authentication, with Google OAuth available but currently hidden on the login screen.
- **Authorization**: Three effective roles (`head_of_talent`, `talent_manager`, `talent`) with `is_master_salesman` acting as the admin gate.
- **Auth Middleware**: `requireMaster` and `requireSalesRole` protect backend endpoints.

#### Recap (Timeline)
- **Interactive Timeline**: Client-side full-text search, grouping, collapsible filters, and PDF/Excel export.
- **AI Briefing**: Collapsible card with AI-generated daily briefings, upcoming actions, reminders, and warnings, powered by `gpt-4o-mini`.

#### Deployment
- **Method Agnostic**: Supports Dockerfile, Nixpacks, Docker Compose, Heroku, and bare metal.
- **Health Check**: `/api/health` endpoint.
- **Schema Management**: Automatic database schema synchronization at startup.
- **GCP Deployment**: Infrastructure scripts for Google Cloud Platform.

## External Dependencies

- **Database**: PostgreSQL
- **Authentication**: `bcryptjs`, `express-session`, `connect-pg-simple`, Google OAuth 2.0, Microsoft OAuth.
- **Document Generation**: `docx` package, Puppeteer.
- **AI Services**: OpenAI GPT-4o Vision API.
- **File Conversion**: `pdftoppm`.
- **Open Banking**: TrueLayer Data API.
- **Fonts**: Google Fonts