'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Sparkles,
  Plus,
  Mic,
  ChevronDown,
  AudioLines,
  AudioWaveform,
  ArrowUp,
  Headphones,
  Heart,
  Play,
} from 'lucide-react';

/* ============================================================
   Blink UGC — landing page
   Faithfully ported from the design mock, rebranded:
     • UGCForge  → Blink UGC
     • Seedance  → Kling 3.0 Pro
   The hero video wall and showcase cards render the real
   template videos hosted on Cloudinary — the same source the
   iOS app and API use.
============================================================ */

// Real template videos used by the Blink UGC app (same Cloudinary
// account that powers /api/ugc/featured). Hardcoded here so the
// landing renders instantly even before the API responds.
const CLOUDINARY_BASE = 'https://res.cloudinary.com/dgx0o3xfx/video/upload';

// Raw template ids: `<version>/<public_id>` — keep one entry per
// distinct creator so the wall feels varied.
const TEMPLATE_SOURCES: { id: string; label: string }[] = [
  { id: 'v1779194220/clothing_dz0lgx',    label: 'Fashion' },
  { id: 'v1779194153/serum_v7vdbw',       label: 'Skincare' },
  { id: 'v1779194166/lipgloss_isfdie',    label: 'Beauty' },
  { id: 'v1779194138/jewellery_1_wpjdb1', label: 'Jewellery' },
  { id: 'v1779194151/jewellery_2_n8ceyx', label: 'Evening' },
  { id: 'v1779194268/gym_wjiimf',         label: 'Fitness' },
];

// Cloudinary URL-based transforms. `f_auto` picks WebM/HEVC/MP4 per
// browser, `q_auto` compresses aggressively, `w_<n>` shrinks to the
// tile size, `so_0` makes the poster the first keyframe.
function cldVideo(id: string, w: number) {
  return `${CLOUDINARY_BASE}/f_auto,q_auto,vc_auto,w_${w}/${id}.mp4`;
}
function cldPoster(id: string, w: number) {
  return `${CLOUDINARY_BASE}/so_0,f_auto,q_auto,w_${w}/${id}.jpg`;
}

// Tile-sized (small) and card-sized (bigger) variants — both are
// way smaller than the source MP4s and cache hard on the Cloudinary
// CDN so subsequent tiles using the same id are instant.
const TILE_VIDEOS = TEMPLATE_SOURCES.map((s) => ({
  src: cldVideo(s.id, 360),
  poster: cldPoster(s.id, 360),
  label: s.label,
}));
const CARD_VIDEOS = TEMPLATE_SOURCES.map((s) => ({
  src: cldVideo(s.id, 720),
  poster: cldPoster(s.id, 720),
  label: s.label,
}));

// Responsive wall sizing. Total tile count drives how many <video> decoders
// the browser has to keep alive concurrently, which is the #1 source of
// jank on phones and mid-range laptops. We keep the unique-URL count at 6
// (so the network cost is identical across breakpoints) but scale the
// number of decoders down hard on smaller screens.
type WallLayout = { cols: number; perCol: number };
const LAYOUT_MOBILE: WallLayout = { cols: 3, perCol: 3 };   //  9 tiles
const LAYOUT_TABLET: WallLayout = { cols: 4, perCol: 4 };   // 16 tiles
const LAYOUT_DESKTOP: WallLayout = { cols: 5, perCol: 4 };  // 20 tiles

function pickLayout(width: number): WallLayout {
  if (width < 640) return LAYOUT_MOBILE;
  if (width < 1024) return LAYOUT_TABLET;
  return LAYOUT_DESKTOP;
}

function useWallLayout(): WallLayout {
  // SSR-safe: assume desktop on the server, refine on mount.
  const [layout, setLayout] = useState<WallLayout>(LAYOUT_DESKTOP);
  useEffect(() => {
    const update = () => setLayout(pickLayout(window.innerWidth));
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  return layout;
}

interface Tile {
  src: string;
  poster: string;
  label: string;
  live: boolean;
}

export function BlinkLanding() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Preload the 6 unique tile videos + posters as soon as the page
  // mounts so the 30-tile wall hydrates from cache and plays instantly.
  useEffect(() => {
    const added: HTMLLinkElement[] = [];
    const head = document.head;
    for (const v of TILE_VIDEOS) {
      const lv = document.createElement('link');
      lv.rel = 'preload';
      lv.as = 'video';
      lv.href = v.src;
      lv.type = 'video/mp4';
      head.appendChild(lv);
      added.push(lv);

      const lp = document.createElement('link');
      lp.rel = 'preload';
      lp.as = 'image';
      lp.href = v.poster;
      head.appendChild(lp);
      added.push(lp);
    }
    // Also kick off a hidden fetch on the videos themselves — some
    // browsers ignore <link rel=preload as=video>, but fetch() always
    // primes the HTTP cache for the <video> elements below.
    const ctrl = new AbortController();
    for (const v of TILE_VIDEOS) {
      fetch(v.src, { signal: ctrl.signal, mode: 'no-cors', cache: 'force-cache' }).catch(() => {});
    }
    return () => {
      ctrl.abort();
      for (const el of added) {
        try { head.removeChild(el); } catch {}
      }
    };
  }, []);

  const layout = useWallLayout();

  // Tiles deterministically reuse the 6 real Cloudinary template videos.
  // Every tile sharing the same `src` pulls from the browser cache after
  // the first load, so the wall is effectively instant once the 6 videos
  // are fetched. Tile count varies by breakpoint (see `useWallLayout`).
  const tiles: Tile[] = useMemo(() => {
    const total = layout.cols * layout.perCol;
    return Array.from({ length: total }, (_, i) => {
      const v = TILE_VIDEOS[i % TILE_VIDEOS.length];
      return {
        src: v.src,
        poster: v.poster,
        label: v.label,
        // deterministic "live" dots — every 4th tile, but never the first
        live: i > 0 && i % 4 === 1,
      };
    });
  }, [layout.cols, layout.perCol]);

  return (
    <div className="font-body-blink bg-[#050608] text-white overflow-x-hidden">
      <PromoBar />
      <Nav scrolled={scrolled} />
      <Hero tiles={tiles} layout={layout} />
      <LogoStrip />
      <HowItWorks />
      <FeatureBreakdown />
      <Showcase />
      <StatsBar />
      <Testimonials />
      <Faq />
      <FinalCta />
      <Footer />
    </div>
  );
}

/* ============================================================
   PROMO BAR
============================================================ */
function PromoBar() {
  return (
    <div className="relative z-[60] flex items-center justify-center gap-3.5 px-4 py-[9px] text-center text-[13px] font-medium tracking-[0.2px] text-white"
         style={{ background: 'linear-gradient(90deg, #e11d2b, #ff2e3f)' }}>
      <span>
        <span aria-hidden>🔥</span> Kling 3.0 Pro is <b className="font-bold">LIVE</b> — create your first AI ad for just <b className="font-bold">$1</b>
      </span>
      <a
        href="#cta-main"
        className="whitespace-nowrap rounded-full bg-white px-3.5 py-[5px] text-xs font-bold text-[#0a0a0a] transition-transform duration-150 hover:-translate-y-0.5"
      >
        Try Now
      </a>
    </div>
  );
}

/* ============================================================
   NAV
============================================================ */
function Nav({ scrolled }: { scrolled: boolean }) {
  return (
    <nav
      className={[
        'fixed left-0 right-0 top-0 z-50 flex items-center justify-between',
        'transition-[background,backdrop-filter,border-color,margin-top,padding] duration-300 ease-out',
        scrolled
          ? 'mt-0 border-b border-white/10 bg-[rgba(5,6,8,0.72)] px-9 py-3.5 backdrop-blur-xl'
          : 'mt-10 border-b border-transparent px-9 py-[18px]',
        'max-[900px]:px-5',
      ].join(' ')}
      style={scrolled ? { backdropFilter: 'blur(18px) saturate(140%)', WebkitBackdropFilter: 'blur(18px) saturate(140%)' } : undefined}
    >
      <Link href="/" className="flex items-center">
        <Image
          src="/brand/logo-combined.png"
          alt="Blink UGC"
          width={200}
          height={42}
          priority
          className="h-[38px] w-auto"
        />
      </Link>

      <div className="flex items-center gap-[30px] text-[14.5px] font-medium max-[900px]:hidden">
        <NavLink href="#features" caret>Features</NavLink>
        <NavLink href="#how">How it works</NavLink>
        <NavLink href="#pricing">Pricing</NavLink>
        <NavLink href="#faq">FAQ</NavLink>
        <NavLink href="#enterprise">Enterprise</NavLink>
      </div>

      <div className="flex items-center gap-3.5">
        <Link
          href="/login"
          className="px-1.5 py-2.5 text-[14.5px] font-medium text-white transition-opacity hover:opacity-70"
        >
          Login
        </Link>
        <Link
          href="/login?mode=signup"
          className="rounded-full bg-white px-[22px] py-2.5 text-[14.5px] font-bold text-[#080808] transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[0_12px_30px_rgba(255,255,255,0.18)]"
        >
          Get Started
        </Link>
      </div>
    </nav>
  );
}

function NavLink({ href, children, caret }: { href: string; children: React.ReactNode; caret?: boolean }) {
  return (
    <a href={href} className="relative text-white/60 transition-colors hover:text-white">
      {children}
      {caret && <span className="ml-[5px] text-[9px] opacity-60">▾</span>}
    </a>
  );
}

/* ============================================================
   HERO
============================================================ */
function Hero({ tiles, layout }: { tiles: Tile[]; layout: WallLayout }) {
  const heroRef = useRef<HTMLElement>(null);
  // `playing` flips to false only when the hero is *entirely* out of the
  // viewport (every pixel scrolled past). `threshold: 0` + checking
  // `isIntersecting` gives us exactly that: as long as a single pixel of
  // the hero is visible, videos keep playing. On initial mount we default
  // to `true` so the wall plays instantly without waiting for the observer
  // to fire its first callback.
  const [playing, setPlaying] = useState(true);
  useEffect(() => {
    const el = heroRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      ([entry]) => setPlaying(entry.isIntersecting),
      { threshold: 0 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <header
      ref={heroRef}
      className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-5 pb-20 pt-[120px] text-center"
    >
      <VideoWall tiles={tiles} layout={layout} playing={playing} />

      <div className="pointer-events-none absolute inset-0 z-[1] blink-hero-edges" />
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 z-[2] -translate-x-1/2 -translate-y-1/2 rounded-[40px] blink-hero-frost"
        style={{ width: 'min(880px, 92vw)', height: 'min(560px, 72vh)' }}
      />
      <div className="pointer-events-none absolute inset-0 z-[1] blink-hero-vignette" />

      <div className="relative z-[5] max-w-[920px]">
        <span className="blink-rise mb-[26px] inline-flex items-center gap-2.5 rounded-full border border-white/10 bg-white/[0.07] px-4 py-[7px] text-[13px] font-semibold tracking-[0.5px] text-white backdrop-blur">
          <span className="h-[7px] w-[7px] rounded-full" style={{ background: '#ff2e3f', boxShadow: '0 0 10px #ff2e3f' }} />
          Powered by Kling 3.0 Pro
        </span>

        <h1
          className="font-display-blink font-black blink-rise"
          style={{
            fontSize: 'clamp(42px, 7.4vw, 92px)',
            lineHeight: 0.96,
            letterSpacing: '-0.03em',
            textShadow: '0 8px 50px rgba(0,0,0,0.7)',
            animationDelay: '0.06s',
          }}
        >
          The fastest way to create{' '}
          <span className="blink-accent-text">AI&nbsp;UGC&nbsp;videos</span>
        </h1>

        <p
          className="blink-rise mx-auto mt-[26px] max-w-[560px] font-normal leading-[1.55] text-white/60"
          style={{
            fontSize: 'clamp(15px, 1.9vw, 19px)',
            textShadow: '0 2px 16px rgba(0,0,0,0.7)',
            animationDelay: '0.14s',
          }}
        >
          <span className="font-semibold text-white">Write your script</span>
          <span className="mx-[7px] font-bold" style={{ color: '#4d82ff' }}>→</span>
          <span className="font-semibold text-white">Pick an avatar</span>
          <span className="mx-[7px] font-bold" style={{ color: '#4d82ff' }}>→</span>
          <span className="font-semibold text-white">Generate video</span>
        </p>

        <div
          id="cta-main"
          className="blink-rise mt-[38px] flex flex-wrap items-center justify-center gap-4"
          style={{ animationDelay: '0.22s' }}
        >
          <Link
            href="/login?mode=signup"
            className="blink-sheen relative overflow-hidden rounded-full border-none px-[38px] py-[18px] font-display-blink text-[17px] font-extrabold tracking-[0.2px] text-white transition-all duration-200 ease-out hover:-translate-y-[3px] hover:scale-[1.02]"
            style={{
              background: 'linear-gradient(135deg, #ff2e3f, #e11d2b)',
              boxShadow: '0 14px 44px rgba(225,29,43,0.5), inset 0 1px 0 rgba(255,255,255,0.2)',
            }}
          >
            <span className="relative z-[2]">Create Your Ad For $1 →</span>
          </Link>
          <a
            href="#showcase"
            className="inline-flex items-center gap-2.5 rounded-full border border-white/[0.18] bg-white/[0.08] px-[30px] py-[18px] text-[16px] font-semibold text-white backdrop-blur transition-all duration-200 ease-out hover:-translate-y-0.5 hover:bg-white/[0.14]"
          >
            <span className="grid h-[26px] w-[26px] place-items-center rounded-full bg-white text-[11px] text-[#080808]">▶</span>
            Watch the demo
          </a>
        </div>

        <div
          className="blink-rise mt-[34px] flex flex-wrap items-center justify-center gap-6 text-[13px] text-white/60"
          style={{ animationDelay: '0.3s' }}
        >
          <div className="flex items-center gap-2">
            <span className="tracking-[2px]" style={{ color: '#ffb627' }}>★★★★★</span>
            <b className="font-bold text-white">4.9/5</b> from 12,400+ creators
          </div>
          <div className="flex items-center gap-2">
            <b className="font-bold text-white">3M+</b> videos generated
          </div>
          <div className="flex items-center gap-2">No credit card to start</div>
        </div>
      </div>

      <div
        className="blink-rise absolute bottom-[26px] left-1/2 z-[5] flex -translate-x-1/2 flex-col items-center gap-2 text-[11px] uppercase tracking-[2px] text-white/60"
        style={{ animationDelay: '0.5s' }}
      >
        <span>Scroll</span>
        <span
          className="blink-cue-bar h-[34px] w-px"
          style={{ background: 'linear-gradient(rgba(255,255,255,0.6), transparent)' }}
        />
      </div>
    </header>
  );
}

/* ============================================================
   VIDEO WALL
============================================================ */
function VideoWall({
  tiles,
  layout,
  playing,
}: {
  tiles: Tile[];
  layout: WallLayout;
  playing: boolean;
}) {
  // We use inline `gridTemplateColumns` instead of a Tailwind class because
  // `grid-cols-N` would require N to be statically known at build time and
  // we need to swap it at runtime per breakpoint.
  return (
    <div
      className="absolute z-0 grid gap-3.5"
      style={{
        inset: '-8%',
        transform: 'rotate(-4deg) scale(1.18)',
        transformOrigin: 'center',
        gridTemplateColumns: `repeat(${layout.cols}, minmax(0, 1fr))`,
      }}
      aria-hidden
    >
      {Array.from({ length: layout.cols }).map((_, c) => {
        const dir = c % 2 === 0 ? 'blink-col-up' : 'blink-col-down';
        const slow = c % 3 === 0 ? 'blink-slow' : '';
        const colTiles = tiles.slice(c * layout.perCol, c * layout.perCol + layout.perCol);
        return (
          <div key={c} className={`flex flex-col gap-3.5 ${dir} ${slow}`}>
            {[...colTiles, ...colTiles].map((tile, i) => (
              <VTile key={`${c}-${i}`} tile={tile} playing={playing} />
            ))}
          </div>
        );
      })}
    </div>
  );
}

function VTile({ tile, playing }: { tile: Tile; playing: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);

  // Some browsers (Safari especially) need an explicit play() after
  // autoplay+muted to actually start the loop. Kick it off on mount
  // and on every metadata load.
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const tryPlay = () => v.play().catch(() => {});
    tryPlay();
    v.addEventListener('loadedmetadata', tryPlay);
    v.addEventListener('canplay', tryPlay);
    return () => {
      v.removeEventListener('loadedmetadata', tryPlay);
      v.removeEventListener('canplay', tryPlay);
    };
  }, []);

  // Pause/resume in response to the hero leaving the viewport. Pausing
  // releases the decode pipeline, which is what frees the CPU/GPU once
  // the user scrolls past the hero.
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (playing) {
      v.play().catch(() => {});
    } else {
      v.pause();
    }
  }, [playing]);

  return (
    <div
      className="relative aspect-[9/16] shrink-0 overflow-hidden rounded-[14px] bg-[#11131a]"
      style={{ boxShadow: '0 18px 50px rgba(0,0,0,0.55)' }}
    >
      {tile.live && (
        <span
          className="blink-live-dot absolute left-[9px] top-[9px] z-[3] h-[7px] w-[7px] rounded-full"
          style={{ background: '#ff2e3f' }}
        />
      )}
      <video
        ref={ref}
        src={tile.src}
        poster={tile.poster}
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        disablePictureInPicture
        className="block h-full w-full object-cover"
      />
    </div>
  );
}

/* ============================================================
   LOGO STRIP
============================================================ */
function LogoStrip() {
  return (
    <section className="relative z-[5] border-y border-white/10 bg-[#050608] px-5 py-[46px] text-center">
      <p className="mb-6 text-xs uppercase tracking-[2.5px] text-white/60">
        Trusted by brands &amp; agencies scaling content
      </p>
      <div className="flex flex-wrap items-center justify-center gap-x-[54px] gap-y-4 opacity-55">
        {['Magalu', 'NORTHBEAM', 'Hyros', 'Triple Whale', 'Foreplay', 'NORDIC LABS', 'FIGMENT'].map((b) => (
          <span key={b} className="font-display-blink text-[21px] font-extrabold tracking-[-0.5px] text-white">
            {b}
          </span>
        ))}
      </div>
    </section>
  );
}

/* ============================================================
   HOW IT WORKS (new section)
============================================================ */
function HowItWorks() {
  const steps = [
    {
      n: '01',
      t: 'Write your script',
      d: 'Paste a hook or let our AI write one for you in your brand voice. Three variations in under 10 seconds.',
    },
    {
      n: '02',
      t: 'Pick an avatar',
      d: 'Choose from 200+ hyper-real creators — or generate a brand-new one from a single prompt.',
    },
    {
      n: '03',
      t: 'Generate & ship',
      d: 'Kling 3.0 Pro renders a 9:16 video with lip-synced voice and captions, ready for TikTok & Reels.',
    },
  ];

  return (
    <section
      id="how"
      className="relative z-[5] px-5 py-[110px] text-center"
      style={{ background: 'linear-gradient(180deg, #050608, #0b0d12)' }}
    >
      <h2
        className="mx-auto max-w-[780px] font-display-blink font-black"
        style={{ fontSize: 'clamp(30px, 4.6vw, 56px)', lineHeight: 1.02, letterSpacing: '-0.025em' }}
      >
        Three steps from blank page to <span style={{ color: '#ff2e3f' }}>scroll-stopping ad.</span>
      </h2>
      <p className="mx-auto mt-5 max-w-[560px] text-[17px] leading-[1.6] text-white/60">
        No studio, no crew, no shoot day. Just a fast feedback loop between you and the data.
      </p>

      <div className="mx-auto mt-16 grid max-w-[1080px] grid-cols-1 gap-[22px] md:grid-cols-3">
        {steps.map((s) => (
          <div
            key={s.n}
            className="relative rounded-[20px] border border-white/10 bg-white/[0.03] p-7 text-left transition-all duration-300 ease-out hover:-translate-y-2 hover:border-[rgba(77,130,255,0.5)]"
          >
            <div
              className="font-display-blink text-[44px] font-black leading-none"
              style={{
                background: 'linear-gradient(135deg, #4d82ff, #2563ff, #ff2e3f)',
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
                color: 'transparent',
              }}
            >
              {s.n}
            </div>
            <h3 className="mt-4 font-display-blink text-[22px] font-bold">{s.t}</h3>
            <p className="mt-2 text-[15px] leading-[1.55] text-white/60">{s.d}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ============================================================
   FEATURE BREAKDOWN — 3 alternating cards with UI mockups
============================================================ */
function FeatureBreakdown() {
  const items: {
    kicker: 0 | 1 | 2;
    title: string;
    desc: string;
    Mockup: () => JSX.Element;
    mockupRight: boolean;
  }[] = [
    {
      kicker: 0,
      title: 'Write or generate your script',
      desc: 'Enter your hook or let AI write three variations in your brand voice — in under 10 seconds.',
      Mockup: ScriptMockup,
      mockupRight: true,
    },
    {
      kicker: 1,
      title: 'Choose from 200+ AI creators',
      desc: 'Pick a hyper-real presenter from our library — or generate a brand-new one from a single prompt.',
      Mockup: ActorsMockup,
      mockupRight: false,
    },
    {
      kicker: 2,
      title: 'Generate your video',
      desc: 'Combine creator and script to ship 9:16 lip-synced ads in 30 seconds — ready for TikTok and Reels.',
      Mockup: VideoMockup,
      mockupRight: true,
    },
  ];

  return (
    <section
      className="relative z-[5] px-5 py-[110px] text-center"
      style={{ background: 'linear-gradient(180deg, #0b0d12, #050608)' }}
    >
      <h2
        className="mx-auto max-w-[860px] font-display-blink font-black"
        style={{ fontSize: 'clamp(30px, 4.6vw, 56px)', lineHeight: 1.02, letterSpacing: '-0.025em' }}
      >
        Create <span className="blink-accent-text">AI&nbsp;UGC</span> videos in minutes
      </h2>
      <p className="mx-auto mt-5 max-w-[560px] text-[17px] leading-[1.6] text-white/60">
        From idea to video in minutes — ready to use instantly.
      </p>

      <div className="mx-auto mt-16 grid max-w-[1120px] gap-5">
        {items.map((it) => (
          <div
            key={it.kicker}
            className="grid grid-cols-1 gap-5 md:grid-cols-2"
          >
            <div className={it.mockupRight ? '' : 'md:order-2'}>
              <FeatureTextCard kicker={it.kicker} title={it.title} desc={it.desc} />
            </div>
            <div className={it.mockupRight ? '' : 'md:order-1'}>
              <FeatureMockupCard>
                <it.Mockup />
              </FeatureMockupCard>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function FeatureTextCard({ kicker, title, desc }: { kicker: 0 | 1 | 2; title: string; desc: string }) {
  return (
    <div className="relative flex h-full min-h-[300px] flex-col rounded-[20px] border border-white/10 bg-white/[0.03] p-7 text-left transition-all duration-300 ease-out hover:-translate-y-1 hover:border-[rgba(77,130,255,0.5)]">
      <StepIndicator active={kicker} />
      <div className="mt-auto">
        <h3 className="font-display-blink text-[22px] font-bold leading-tight">{title}</h3>
        <p className="mt-2 text-[15px] leading-[1.55] text-white/60">{desc}</p>
      </div>
    </div>
  );
}

function FeatureMockupCard({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="relative flex h-full min-h-[300px] items-center justify-center overflow-hidden rounded-[20px] border border-white/10 p-8"
      style={{
        background:
          'radial-gradient(circle at 30% 20%, rgba(77,130,255,0.10), transparent 55%), radial-gradient(circle at 80% 80%, rgba(255,46,63,0.08), transparent 55%), rgba(255,255,255,0.03)',
      }}
    >
      <StepIndicator active={1} className="absolute left-7 top-7" />
      {children}
    </div>
  );
}

function StepIndicator({ active, className = '' }: { active: 0 | 1 | 2; className?: string }) {
  return (
    <div className={`flex gap-1.5 ${className}`}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-[3px] w-7 rounded-full"
          style={{ background: i === active ? '#4d82ff' : 'rgba(77,130,255,0.22)' }}
        />
      ))}
    </div>
  );
}

/* ----- Mockup 1: Script writer ----- */
function ScriptMockup() {
  return (
    <div className="w-full max-w-[420px]">
      <div
        className="rounded-2xl border border-white/10 bg-[#0a0b10] p-4 text-left"
        style={{ boxShadow: '0 28px 60px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.04)' }}
      >
        <div className="flex items-start justify-between gap-3">
          <span className="text-[14px] text-white/35">Write your script…</span>
          <span
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold text-white"
            style={{ background: 'linear-gradient(135deg, #4d82ff, #7a4dff 60%, #ff2e3f)' }}
          >
            <Sparkles className="h-3 w-3" />
            AI Script writer
          </span>
        </div>

        <div className="h-14" />

        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] text-white/70">
            <Plus className="h-3 w-3" /> Credits <b className="text-white">6</b>
          </span>
          <span className="text-[11px] text-white/35">0 / 1000</span>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-white/5 pt-3">
          <MockIconBtn>
            <Mic className="h-3.5 w-3.5" />
          </MockIconBtn>
          <MockChip>
            <Headphones className="h-3 w-3" />
            Talking Actors
            <ChevronDown className="h-3 w-3 opacity-60" />
          </MockChip>
          <MockChip>
            <Plus className="h-3 w-3" /> Add Actors
          </MockChip>
          <MockChip>
            <AudioLines className="h-3 w-3" /> Edit Voice
          </MockChip>
          <span className="ml-auto flex items-center gap-1.5">
            <MockIconBtn>
              <AudioWaveform className="h-3.5 w-3.5" />
            </MockIconBtn>
            <MockIconBtn accent>
              <ArrowUp className="h-3.5 w-3.5" />
            </MockIconBtn>
          </span>
        </div>
      </div>
    </div>
  );
}

function MockChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-medium text-white/75">
      {children}
    </span>
  );
}

function MockIconBtn({ children, accent }: { children: React.ReactNode; accent?: boolean }) {
  return (
    <span
      className={
        accent
          ? 'grid h-7 w-7 place-items-center rounded-full bg-white text-[#080808]'
          : 'grid h-7 w-7 place-items-center rounded-full border border-white/10 bg-white/[0.05] text-white/75'
      }
    >
      {children}
    </span>
  );
}

/* ----- Mockup 2: Actor fan ----- */
function ActorsMockup() {
  // Reuse the same Cloudinary template posters as the hero wall so the
  // mockup feels real, not stocky. Poster only — no extra <video> decoders.
  const cards = TILE_VIDEOS.slice(0, 5);
  const names = ['Angela', 'Mike', 'Saman', 'Mila', 'Jason'];
  const layout = [
    { x: -120, y: 22, rot: -10, z: 1, scale: 0.9 },
    { x: -62, y: 6, rot: -5, z: 2, scale: 0.96 },
    { x: 0, y: -8, rot: 0, z: 3, scale: 1.08 },
    { x: 62, y: 6, rot: 5, z: 2, scale: 0.96 },
    { x: 120, y: 22, rot: 10, z: 1, scale: 0.9 },
  ];
  return (
    <div className="relative h-[260px] w-full max-w-[460px]">
      {cards.map((c, i) => {
        const p = layout[i];
        return (
          <div
            key={i}
            className="absolute left-1/2 top-1/2 aspect-[9/14] w-[120px] overflow-hidden rounded-[14px] border border-white/15 bg-[#11131a]"
            style={{
              transform: `translate(calc(-50% + ${p.x}px), calc(-50% + ${p.y}px)) rotate(${p.rot}deg) scale(${p.scale})`,
              zIndex: p.z,
              boxShadow: '0 22px 50px rgba(0,0,0,0.55)',
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={c.poster} alt="" className="h-full w-full object-cover" />
            {i === 2 && (
              <span className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-black/55 text-white backdrop-blur">
                <Heart className="h-3 w-3 fill-white" />
              </span>
            )}
            <div className="absolute inset-x-1.5 bottom-1.5 flex items-center justify-between rounded-md bg-black/55 px-1.5 py-[3px] text-[10px] font-semibold text-white backdrop-blur">
              <span>{names[i]}</span>
              <span className="rounded-sm bg-white/20 px-1 text-[9px]">HD</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ----- Mockup 3: Final video result ----- */
function VideoMockup() {
  const c = [TILE_VIDEOS[5], TILE_VIDEOS[4], TILE_VIDEOS[3]];
  const layout = [
    { x: -95, y: 14, rot: -8, z: 1, scale: 0.92 },
    { x: 0, y: -12, rot: 0, z: 3, scale: 1.08 },
    { x: 95, y: 14, rot: 8, z: 1, scale: 0.92 },
  ];
  return (
    <div className="relative h-[300px] w-full max-w-[460px]">
      {c.map((v, i) => {
        const p = layout[i];
        return (
          <div
            key={i}
            className="absolute left-1/2 top-1/2 aspect-[9/19] w-[140px] overflow-hidden rounded-[22px] border-[3px] border-[#11131a] bg-[#11131a]"
            style={{
              transform: `translate(calc(-50% + ${p.x}px), calc(-50% + ${p.y}px)) rotate(${p.rot}deg) scale(${p.scale})`,
              zIndex: p.z,
              boxShadow: '0 26px 64px rgba(0,0,0,0.65)',
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={v.poster} alt="" className="h-full w-full object-cover" />
            {i === 1 && (
              <>
                <span className="absolute left-2 top-2 rounded-full bg-black/65 px-2 py-[2px] text-[10px] font-semibold text-white backdrop-blur">
                  01:48
                </span>
                <span className="absolute inset-0 m-auto grid h-11 w-11 place-items-center rounded-full bg-white text-[#080808] shadow-[0_8px_22px_rgba(0,0,0,0.45)]">
                  <Play className="h-4 w-4 fill-[#080808]" />
                </span>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ============================================================
   SHOWCASE (cards w/ live video thumbs)
============================================================ */
function Showcase() {
  const cards = [
    {
      t: 'Hyper-real avatars',
      d: 'Diverse, lifelike presenters that look filmed on a phone — not rendered.',
      b: 'NEW',
      video: CARD_VIDEOS[0],
    },
    {
      t: 'Script → video in 30s',
      d: 'Paste a hook, pick a voice, hit generate. Ten variations before your coffee cools.',
      b: 'FAST',
      video: CARD_VIDEOS[2],
    },
    {
      t: 'Built for ads',
      d: '9:16 native, captions baked in, ready to upload straight to TikTok & Reels.',
      b: '$1',
      video: CARD_VIDEOS[5],
    },
  ];

  return (
    <section
      id="features"
      className="relative z-[5] px-5 py-[110px] pb-[130px] text-center"
      style={{ background: 'linear-gradient(180deg, #0b0d12, #050608)' }}
    >
      <h2
        id="showcase"
        className="mx-auto max-w-[780px] font-display-blink font-black"
        style={{ fontSize: 'clamp(30px, 4.6vw, 56px)', lineHeight: 1.02, letterSpacing: '-0.025em' }}
      >
        One amazing video is all it takes to <span style={{ color: '#ff2e3f' }}>sell.</span>
      </h2>
      <p className="mx-auto mt-5 max-w-[560px] text-[17px] leading-[1.6] text-white/60">
        Generate hyper-realistic UGC ads in seconds. Real-looking avatars, real emotion, real conversions —
        at a fraction of the cost of a creator.
      </p>

      <div className="mx-auto mt-16 grid max-w-[1080px] grid-cols-1 gap-[22px] md:grid-cols-3">
        {cards.map((c) => (
          <div
            key={c.t}
            className="relative overflow-hidden rounded-[20px] border border-white/10 bg-white/[0.03] text-left transition-all duration-300 ease-out hover:-translate-y-2 hover:border-[rgba(77,130,255,0.5)]"
          >
            <div className="absolute right-3 top-3 z-[3] rounded-full border border-white/10 bg-black/60 px-3 py-[5px] text-[11px] font-bold tracking-[0.5px] backdrop-blur">
              {c.b}
            </div>
            <div className="relative aspect-[9/12] overflow-hidden">
              <ShowcaseVideo src={c.video.src} poster={c.video.poster} />
            </div>
            <div className="p-[22px]">
              <h3 className="font-display-blink text-[19px] font-bold">{c.t}</h3>
              <p className="mt-2 text-[14.5px] leading-[1.55] text-white/60">{c.d}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ShowcaseVideo({ src, poster }: { src: string; poster: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const tryPlay = () => v.play().catch(() => {});
    tryPlay();
    v.addEventListener('loadedmetadata', tryPlay);
    v.addEventListener('canplay', tryPlay);
    return () => {
      v.removeEventListener('loadedmetadata', tryPlay);
      v.removeEventListener('canplay', tryPlay);
    };
  }, []);
  return (
    <video
      ref={ref}
      src={src}
      poster={poster}
      autoPlay
      muted
      loop
      playsInline
      preload="auto"
      disablePictureInPicture
      className="block h-full w-full object-cover"
    />
  );
}

/* ============================================================
   STATS BAR (new section)
============================================================ */
function StatsBar() {
  const stats = [
    { v: '3M+', l: 'videos generated' },
    { v: '30s', l: 'avg render time' },
    { v: '200+', l: 'AI creators' },
    { v: '12.4k', l: 'happy founders' },
  ];
  return (
    <section className="relative z-[5] border-y border-white/10 bg-[#050608] px-5 py-[60px]">
      <div className="mx-auto grid max-w-[1080px] grid-cols-2 gap-8 md:grid-cols-4">
        {stats.map((s) => (
          <div key={s.l} className="text-center">
            <div
              className="font-display-blink font-black"
              style={{
                fontSize: 'clamp(32px, 4.5vw, 48px)',
                lineHeight: 1,
                background: 'linear-gradient(135deg, #4d82ff, #ff2e3f)',
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
                color: 'transparent',
              }}
            >
              {s.v}
            </div>
            <div className="mt-2 text-[13px] uppercase tracking-[1.5px] text-white/60">{s.l}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ============================================================
   TESTIMONIALS (new section)
============================================================ */
function Testimonials() {
  const tweets = [
    {
      name: 'Maya Chen',
      role: 'Founder, Halo Skincare',
      avatar: 'MC',
      quote:
        'We replaced our $4k/mo creator agency in a week. Blink ads outperformed our hand-shot UGC by 38% on day one.',
    },
    {
      name: 'Ravi Patel',
      role: 'Growth, Nordic Labs',
      avatar: 'RP',
      quote:
        'Ten ad variations before lunch. The Kling 3.0 Pro renders look exactly like an iPhone selfie — no uncanny valley.',
    },
    {
      name: 'Sofia Martins',
      role: 'CMO, Magalu',
      avatar: 'SM',
      quote:
        'The lip-sync is genuinely scary good. We A/B test five hooks on every drop and let the data pick the winner.',
    },
  ];

  return (
    <section className="relative z-[5] px-5 py-[110px]" style={{ background: '#050608' }}>
      <h2
        className="mx-auto max-w-[780px] text-center font-display-blink font-black"
        style={{ fontSize: 'clamp(30px, 4.6vw, 56px)', lineHeight: 1.02, letterSpacing: '-0.025em' }}
      >
        Founders are <span className="blink-accent-text">shipping faster.</span>
      </h2>
      <p className="mx-auto mt-5 max-w-[560px] text-center text-[17px] leading-[1.6] text-white/60">
        Real numbers from real brands using Blink UGC to fuel paid acquisition.
      </p>

      <div className="mx-auto mt-16 grid max-w-[1180px] grid-cols-1 gap-[22px] md:grid-cols-3">
        {tweets.map((t) => (
          <figure
            key={t.name}
            className="rounded-[20px] border border-white/10 bg-white/[0.03] p-7 transition-all duration-300 hover:border-[rgba(255,46,63,0.4)]"
          >
            <blockquote className="text-[16px] leading-[1.55] text-white/85">“{t.quote}”</blockquote>
            <figcaption className="mt-6 flex items-center gap-3">
              <div
                className="grid h-11 w-11 place-items-center rounded-full font-display-blink text-[14px] font-bold text-white"
                style={{ background: 'linear-gradient(135deg, #2563ff, #ff2e3f)' }}
              >
                {t.avatar}
              </div>
              <div>
                <div className="text-[14px] font-semibold text-white">{t.name}</div>
                <div className="text-[12.5px] text-white/55">{t.role}</div>
              </div>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}

/* ============================================================
   FAQ (new section)
============================================================ */
function Faq() {
  const items = [
    {
      q: 'What model powers Blink UGC?',
      a: "Every video is rendered on Kling 3.0 Pro — the latest state-of-the-art video model — with ElevenLabs voices on top for lip-synced dialogue.",
    },
    {
      q: 'How long does a video take to generate?',
      a: 'About 30 seconds for a 9:16 ad. You can queue ten variations and let them all render in parallel.',
    },
    {
      q: 'Can I bring my own creator?',
      a: 'Yes. Generate a brand-new AI creator from a single prompt, or promote any generation to a reusable template.',
    },
    {
      q: 'How does the $1 first ad work?',
      a: 'Sign up and your first generation is $1 — no subscription, no credit card needed to try the product.',
    },
    {
      q: 'Where do I post the videos?',
      a: 'Every ad is 9:16 native with baked-in captions, ready to upload directly to TikTok, Reels, Shorts, and Meta ads.',
    },
  ];
  return (
    <section id="faq" className="relative z-[5] px-5 py-[110px]" style={{ background: 'linear-gradient(180deg, #050608, #0b0d12)' }}>
      <h2
        className="mx-auto max-w-[780px] text-center font-display-blink font-black"
        style={{ fontSize: 'clamp(30px, 4.6vw, 56px)', lineHeight: 1.02, letterSpacing: '-0.025em' }}
      >
        Questions, <span style={{ color: '#ff2e3f' }}>answered.</span>
      </h2>
      <div className="mx-auto mt-12 max-w-[820px] divide-y divide-white/10 overflow-hidden rounded-[20px] border border-white/10 bg-white/[0.03]">
        {items.map((it) => (
          <FaqItem key={it.q} q={it.q} a={it.a} />
        ))}
      </div>
    </section>
  );
}

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-4 px-7 py-6 text-left transition-colors hover:bg-white/[0.02]"
      >
        <span className="font-display-blink text-[17px] font-semibold">{q}</span>
        <span
          className="grid h-7 w-7 place-items-center rounded-full border border-white/15 text-[13px] transition-transform duration-300"
          style={{ transform: open ? 'rotate(45deg)' : 'rotate(0)' }}
          aria-hidden
        >
          +
        </span>
      </button>
      <div
        ref={ref}
        className="overflow-hidden transition-[max-height,opacity] duration-300 ease-out"
        style={{
          maxHeight: open ? (ref.current?.scrollHeight ?? 200) : 0,
          opacity: open ? 1 : 0,
        }}
      >
        <p className="px-7 pb-6 text-[15px] leading-[1.65] text-white/65">{a}</p>
      </div>
    </div>
  );
}

/* ============================================================
   FINAL CTA
============================================================ */
function FinalCta() {
  return (
    <section
      id="pricing"
      className="relative z-[5] overflow-hidden px-5 py-[120px] text-center"
      style={{ background: 'radial-gradient(circle at 50% 0%, rgba(37,99,255,0.18), transparent 55%), #050608' }}
    >
      <h2
        className="font-display-blink font-black"
        style={{ fontSize: 'clamp(34px, 5.5vw, 68px)', letterSpacing: '-0.03em', lineHeight: 1 }}
      >
        Your first ad costs <span style={{ color: '#ff2e3f' }}>$1.</span>
      </h2>
      <p className="mx-auto mt-[22px] max-w-[480px] text-[17px] text-white/60">
        Stop guessing what converts. Generate ten variations before lunch and let the data decide.
      </p>
      <div className="mt-9 flex flex-wrap items-center justify-center gap-4">
        <Link
          href="/login?mode=signup"
          className="blink-sheen relative overflow-hidden rounded-full px-[38px] py-[18px] font-display-blink text-[17px] font-extrabold text-white transition-all duration-200 ease-out hover:-translate-y-[3px] hover:scale-[1.02]"
          style={{
            background: 'linear-gradient(135deg, #ff2e3f, #e11d2b)',
            boxShadow: '0 14px 44px rgba(225,29,43,0.5), inset 0 1px 0 rgba(255,255,255,0.2)',
          }}
        >
          <span className="relative z-[2]">Create Your Ad For $1 →</span>
        </Link>
        <a
          href="#showcase"
          className="inline-flex items-center gap-2.5 rounded-full border border-white/[0.18] bg-white/[0.08] px-[30px] py-[18px] text-[16px] font-semibold text-white backdrop-blur transition-all duration-200 hover:-translate-y-0.5 hover:bg-white/[0.14]"
        >
          <span className="grid h-[26px] w-[26px] place-items-center rounded-full bg-white text-[11px] text-[#080808]">▶</span>
          See examples
        </a>
      </div>
    </section>
  );
}

/* ============================================================
   FOOTER
============================================================ */
function Footer() {
  return (
    <footer className="relative z-[5] flex flex-wrap items-center justify-between gap-4 border-t border-white/10 bg-[#050608] px-9 py-[38px] text-[13px] text-white/60">
      <div className="flex items-center">
        <Image
          src="/brand/logo-combined.png"
          alt="Blink UGC"
          width={150}
          height={68}
          className="h-[34px] w-auto"
        />
      </div>
      <div className="flex items-center gap-5">
        <a href="/privacy" className="transition-colors hover:text-white">Privacy</a>
        <a href="/terms" className="transition-colors hover:text-white">Terms</a>
        <a href="mailto:hi@blinkugc.com" className="transition-colors hover:text-white">Contact</a>
      </div>
      <div>© {new Date().getFullYear()} Blink UGC. The fastest way to create AI UGC videos.</div>
    </footer>
  );
}
