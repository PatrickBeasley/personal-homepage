import AboutSection from "@/components/home/about-section";
import ContactSection from "@/components/home/contact-section";
import ProjectsSection from "@/components/home/projects-section";
import SiteFooter from "@/components/home/site-footer";
import SiteHeader from "@/components/home/site-header";

export default function Home() {
  return (
    <div className="flex min-h-dvh flex-col animate-[pbUp_0.5s_ease_both]">
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
