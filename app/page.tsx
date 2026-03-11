import Link from "next/link";
import { Camera, Scan, Download, Sparkles, Check } from "lucide-react";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-zinc-950">
      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-900/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <div className="p-2 bg-cyan-600 rounded-lg">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">JigSnap</h1>
              <p className="text-xs text-zinc-400">Laser Engraving Jig Generator</p>
            </div>
          </Link>
          <Link
            href="/app"
            className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg transition-colors font-medium"
          >
            Try Free →
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="relative py-20 px-4 overflow-hidden">
        {/* Background Image */}
        <div className="absolute inset-0 z-0">
          <img 
            src="/hero-laser-engraving.png" 
            alt="Laser engraving" 
            className="w-full h-full object-cover opacity-30"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-zinc-950 via-zinc-950/80 to-transparent" />
        </div>
        
        <div className="relative z-10 max-w-4xl mx-auto text-center">
          <h1 className="text-5xl md:text-6xl font-bold text-white mb-6">
            Laser Jigs in{" "}
            <span className="text-cyan-400">3 Clicks</span>
          </h1>
          <p className="text-xl text-zinc-300 mb-8 max-w-2xl mx-auto">
            Snap a photo of your object. Auto-detect the outline. Export SVG/STL for laser cutting. 
            No CAD skills required.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/app"
              className="px-8 py-4 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl transition-colors font-semibold text-lg"
            >
              Start Free →
            </Link>
            <a
              href="#how-it-works"
              className="px-8 py-4 bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 rounded-xl transition-colors font-semibold text-lg"
            >
              See How It Works
            </a>
          </div>
          <p className="text-sm text-zinc-400 mt-4">Free tier: 3 jigs/month. No credit card required.</p>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-20 px-4 border-t border-zinc-800">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-white text-center mb-16">How It Works</h2>
          <div className="grid md:grid-cols-3 gap-8">
            <Step
              number={1}
              icon={Camera}
              title="Snap a Photo"
              description="Place your object on white paper and take a photo from above. We'll auto-detect the paper for scale calibration."
              image="/step-1-photo.png"
            />
            <Step
              number={2}
              icon={Scan}
              title="Auto-Detect Outline"
              description="Our computer vision engine finds the object outline instantly. Fine-tune with the interactive editor if needed."
              image="/step-2-detect.png"
            />
            <Step
              number={3}
              icon={Download}
              title="Export & Cut"
              description="Download SVG for laser cutting or STL for 3D printing. Import directly into LightBurn, Cura, or your favorite software."
              image="/step-3-jig.png"
            />
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-4 border-t border-zinc-800 bg-zinc-900/30">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-white text-center mb-16">Features</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            <Feature title="Auto Scale Detection" description="Place on US Letter or A4 paper — we calculate exact dimensions automatically." />
            <Feature title="Interactive Editor" description="Zoom, pan, and fine-tune contours with point-level precision." />
            <Feature title="SVG Export" description="Clean vector output with alignment crosshairs for LightBurn compatibility." />
            <Feature title="STL Export" description="3D printable jigs with through-cut holes, ready for your printer." />
            <Feature title="Offset Control" description="Add clearance for material thickness or tight fits." />
            <Feature title="Privacy First" description="All processing happens in your browser. Your photos never leave your device." />
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="py-20 px-4 border-t border-zinc-800">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-white text-center mb-4">Simple Pricing</h2>
          <p className="text-zinc-400 text-center mb-12">Start free, upgrade when you need more</p>
          
          <div className="grid md:grid-cols-2 gap-8">
            {/* Free */}
            <div className="p-8 rounded-2xl border border-zinc-700 bg-zinc-900/50">
              <h3 className="text-xl font-semibold text-white mb-2">Free</h3>
              <p className="text-zinc-400 mb-6">For hobbyists getting started</p>
              <div className="text-4xl font-bold text-white mb-6">$0</div>
              <ul className="space-y-3 mb-8">
                <PricingItem>3 jigs per month</PricingItem>
                <PricingItem>Basic contour detection</PricingItem>
                <PricingItem>SVG & STL export</PricingItem>
                <PricingItem>Community support</PricingItem>
              </ul>
              <Link
                href="/app"
                className="block w-full py-3 text-center bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg transition-colors font-medium"
              >
                Get Started
              </Link>
            </div>

            {/* Pro */}
            <div className="p-8 rounded-2xl border-2 border-cyan-600 bg-cyan-950/20 relative">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-cyan-600 text-white text-sm font-medium rounded-full">
                Most Popular
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">Pro</h3>
              <p className="text-zinc-400 mb-6">For makers and small businesses</p>
              <div className="text-4xl font-bold text-white mb-6">$8<span className="text-lg text-zinc-400">/mo</span></div>
              <ul className="space-y-3 mb-8">
                <PricingItem>Unlimited jigs</PricingItem>
                <PricingItem>Advanced contour detection</PricingItem>
                <PricingItem>Batch processing</PricingItem>
                <PricingItem>Priority support</PricingItem>
                <PricingItem>Early access to new features</PricingItem>
              </ul>
              <button
                disabled
                className="block w-full py-3 text-center bg-cyan-600 disabled:bg-cyan-800 disabled:cursor-not-allowed text-white rounded-lg transition-colors font-medium"
              >
                Coming Soon
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-4 border-t border-zinc-800 bg-zinc-900/30">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-white mb-4">Ready to make your first jig?</h2>
          <p className="text-zinc-400 mb-8">Join makers who save hours on laser jig setup</p>
          <Link
            href="/app"
            className="px-8 py-4 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl transition-colors font-semibold text-lg inline-block"
          >
            Start Free →
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-4 border-t border-zinc-800">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-1.5 bg-cyan-600 rounded-lg">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <span className="text-zinc-400 text-sm">© 2026 JigSnap. All rights reserved.</span>
          </div>
          <div className="flex gap-6 text-sm text-zinc-500">
            <a href="#" className="hover:text-zinc-300 transition-colors">Privacy</a>
            <a href="#" className="hover:text-zinc-300 transition-colors">Terms</a>
            <a href="mailto:Willbrako@gmail.com" className="hover:text-zinc-300 transition-colors">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

function Step({ number, icon: Icon, title, description, image }: { number: number; icon: React.ElementType; title: string; description: string; image?: string }) {
  return (
    <div className="text-center">
      {image && (
        <div className="mb-6 rounded-2xl overflow-hidden border border-zinc-800 bg-zinc-900">
          <img src={image} alt={title} className="w-full h-48 object-cover" />
        </div>
      )}
      <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-cyan-900/30 border border-cyan-800 flex items-center justify-center">
        <Icon className="w-8 h-8 text-cyan-400" />
      </div>
      <div className="text-sm font-medium text-cyan-400 mb-2">Step {number}</div>
      <h3 className="text-xl font-semibold text-white mb-3">{title}</h3>
      <p className="text-zinc-400">{description}</p>
    </div>
  );
}

function Feature({ title, description }: { title: string; description: string }) {
  return (
    <div className="p-6 rounded-xl border border-zinc-800 bg-zinc-900/50">
      <h3 className="font-semibold text-white mb-2">{title}</h3>
      <p className="text-sm text-zinc-400">{description}</p>
    </div>
  );
}

function PricingItem({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-2 text-zinc-300">
      <Check className="w-4 h-4 text-cyan-400 flex-shrink-0" />
      <span>{children}</span>
    </li>
  );
}
