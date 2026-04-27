import { Switch, Route, useParams, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";

import Dashboard from "@/pages/Dashboard";
import Login from "@/pages/Login";
import Offers from "@/pages/Offers";
import OfferView from "@/pages/OfferView";
import OfferPrint from "@/pages/OfferPrint";
import OfferWorkflow from "@/pages/OfferWorkflow";
import Customers from "@/pages/Customers";
import Companies from "@/pages/Companies";
import AddCompany from "@/pages/AddCompany";
import CompanyDetail from "@/pages/CompanyDetail";
import Contacts from "@/pages/Contacts";
import AddContact from "@/pages/AddContact";
import ContactDetail from "@/pages/ContactDetail";
import Users from "@/pages/Users";
import EditUser from "@/pages/EditUser";
import Settings from "@/pages/Settings";
import AISettings from "@/pages/AISettings";
import DriveArchive from "@/pages/DriveArchive";
import DriveSettings from "@/pages/DriveSettings";
import OfferBin from "@/pages/OfferBin";
import MyAccount from "@/pages/MyAccount";
import Interactions from "@/pages/Interactions";
import InteractionFormPage from "@/pages/InteractionFormPage";
import CrmCalendar from "@/pages/CrmCalendar";
import CrmMap from "@/pages/CrmMap";
import Orders from "@/pages/Orders";
import OrderDetail from "@/pages/OrderDetail";
import OrderVersionView from "@/pages/OrderVersionView";
import OrderPdfReview from "@/pages/OrderPdfReview";
import OrderBin from "@/pages/OrderBin";
import OrderManualCreate from "@/pages/OrderManualCreate";
import Notifications from "@/pages/Notifications";
import SendOfferEmail from "@/pages/SendOfferEmail";
import FinanceAccounts from "@/pages/FinanceAccounts";
import FinanceAccountDetail from "@/pages/FinanceAccountDetail";
import EmailPage from "@/pages/EmailPage";
import Recap from "@/pages/Recap";

import Talents from "@/pages/Talents";
import TalentForm from "@/pages/TalentForm";
import TalentDetail from "@/pages/TalentDetail";
import TalentSettings from "@/pages/TalentSettings";

import Quotes from "@/pages/Quotes";
import QuoteWizard from "@/pages/QuoteWizard";
import QuoteDetail from "@/pages/QuoteDetail";
import Campaigns from "@/pages/Campaigns";
import CampaignDetail from "@/pages/CampaignDetail";

import NotFound from "@/pages/not-found";

function OrderManualEdit() {
  const { id } = useParams<{ id: string }>();
  return <OrderManualCreate editId={Number(id)} />;
}

function Router() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  return (
    <Switch>
      <Route path="/" component={Dashboard} />

      {/* Talent management (new core) */}
      <Route path="/talents/new">{() => <TalentForm mode="create" />}</Route>
      <Route path="/talents/:id/edit">{() => <TalentForm mode="edit" />}</Route>
      <Route path="/talents/:id" component={TalentDetail} />
      <Route path="/talents" component={Talents} />

      {/* Preventivi (Talent Studio) */}
      <Route path="/quotes/new">{() => <QuoteWizard mode="create" />}</Route>
      <Route path="/quotes/:id/edit">{() => <QuoteWizard mode="edit" />}</Route>
      <Route path="/quotes/:id" component={QuoteDetail} />
      <Route path="/quotes" component={Quotes} />

      {/* Legacy /offers → /quotes redirects (deep links to old IDs go to list) */}
      <Route path="/offers">{() => <Redirect to="/quotes" />}</Route>
      <Route path="/offers/new">{() => <Redirect to="/quotes/new" />}</Route>
      <Route path="/offers/:rest*">{() => <Redirect to="/quotes" />}</Route>

      {/* CRM = Brand & contatti */}
      <Route path="/crm/companies/new" component={AddCompany} />
      <Route path="/crm/companies/:id/edit" component={AddCompany} />
      <Route path="/crm/companies/:id" component={CompanyDetail} />
      <Route path="/crm/companies" component={Companies} />
      <Route path="/crm/contacts/new" component={AddContact} />
      <Route path="/crm/contacts/:id/edit" component={AddContact} />
      <Route path="/crm/contacts/:id" component={ContactDetail} />
      <Route path="/crm/contacts" component={Contacts} />
      <Route path="/crm/interactions/new" component={InteractionFormPage} />
      <Route path="/crm/interactions/:id/edit" component={InteractionFormPage} />
      <Route path="/crm/interactions" component={Interactions} />
      <Route path="/crm/calendar" component={CrmCalendar} />
      <Route path="/crm/map" component={CrmMap} />
      <Route path="/crm" component={Customers} />

      {/* Campagne (Talent Studio) */}
      <Route path="/campaigns/:id" component={CampaignDetail} />
      <Route path="/campaigns" component={Campaigns} />

      {/* Legacy /orders → /campaigns redirects */}
      <Route path="/orders">{() => <Redirect to="/campaigns" />}</Route>
      <Route path="/orders/:rest*">{() => <Redirect to="/campaigns" />}</Route>

      {/* Talent settings */}
      <Route path="/talent-settings" component={TalentSettings} />

      {/* Email / Recap / Drive */}
      <Route path="/email" component={EmailPage} />
      <Route path="/recap" component={Recap} />
      <Route path="/drive-archive" component={DriveArchive} />
      <Route path="/drive-settings" component={DriveSettings} />

      {/* Admin */}
      <Route path="/users/new" component={EditUser} />
      <Route path="/users/:id/edit" component={EditUser} />
      <Route path="/users" component={Users} />
      <Route path="/settings" component={Settings} />
      <Route path="/ai-settings" component={AISettings} />
      <Route path="/finance/accounts/:accountId" component={FinanceAccountDetail} />
      <Route path="/finance/accounts" component={FinanceAccounts} />

      {/* Misc */}
      <Route path="/notifications" component={Notifications} />
      <Route path="/account" component={MyAccount} />

      {/* Legacy redirects */}
      <Route path="/dealer/login">{() => <Redirect to="/" />}</Route>
      <Route path="/dealer/:rest*">{() => <Redirect to="/" />}</Route>
      <Route path="/dealers/:rest*">{() => <Redirect to="/" />}</Route>
      <Route path="/dealers">{() => <Redirect to="/" />}</Route>
      <Route path="/drawings/:rest*">{() => <Redirect to="/" />}</Route>
      <Route path="/drawings">{() => <Redirect to="/" />}</Route>
      <Route path="/machines/:rest*">{() => <Redirect to="/" />}</Route>
      <Route path="/machines">{() => <Redirect to="/" />}</Route>
      <Route path="/share-hub/:rest*">{() => <Redirect to="/" />}</Route>
      <Route path="/share-hub">{() => <Redirect to="/" />}</Route>
      <Route path="/travel-pack">{() => <Redirect to="/" />}</Route>
      <Route path="/youtube">{() => <Redirect to="/" />}</Route>
      <Route path="/enquiries/:rest*">{() => <Redirect to="/" />}</Route>
      <Route path="/enquiries">{() => <Redirect to="/" />}</Route>

      <Route component={NotFound} />
    </Switch>
  );
}

import { LanguageProvider } from "@/lib/i18n/LanguageContext";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
        <TooltipProvider>
          <div className="absolute top-4 right-4 z-50">
            <LanguageSwitcher />
          </div>
          <Toaster />
          <Router />
        </TooltipProvider>
      </LanguageProvider>
    </QueryClientProvider>
  );
}

export default App;
