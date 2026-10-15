/* ─── Home Page ─── */
import Hero from '../components/Hero';
import Features from '../components/Features';
import DemoChat from '../components/DemoChat';
import CTA from '../components/CTA';

export default function HomePage() {
  return (
    <>
      <Hero />
      <Features />
      <DemoChat />
      <CTA />
    </>
  );
}
