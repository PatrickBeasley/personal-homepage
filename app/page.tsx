import AboutSection from "@/components/home/about-section";
import ContactSection from "@/components/home/contact-section";
import ProjectsSection from "@/components/home/projects-section";
import SiteFooter from "@/components/home/site-footer";
import SiteHeader from "@/components/home/site-header";

// The footer renders the current year, so this statically prerendered page has
// to be regenerated at least daily or the copyright would freeze at the build
// year. Revalidating keeps the page static and the footer a server component.
export const revalidate = 86400;

export default function Home() {
  return (
    <div className="flex min-h-dvh flex-col animate-[pbUp_0.5s_ease_both] motion-reduce:animate-none">
      <SiteHeader />
      <main className="flex-1">
        <AboutSection />
        <ProjectsSection />
        <ContactSection />
      </main>
      <SiteFooter />
    </div>
  );
}
