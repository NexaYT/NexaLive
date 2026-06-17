import { useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ChannelCard, type ChannelCardData } from "./ChannelCard";

export function ChannelRow({ title, channels }: { title: string; channels: ChannelCardData[] }) {
  const ref = useRef<HTMLDivElement>(null);

  const scroll = (dir: "left" | "right") => {
    ref.current?.scrollBy({ left: dir === "left" ? -600 : 600, behavior: "smooth" });
  };

  if (channels.length === 0) return null;

  return (
    <section className="py-4">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <h2 className="mb-3 text-xl font-bold tracking-tight">{title}</h2>
      </div>
      <div className="relative group">
        <button
          onClick={() => scroll("left")}
          aria-label="Scroll left"
          className="absolute left-0 top-0 z-10 hidden h-full w-12 items-center justify-center bg-gradient-to-r from-background/90 to-transparent opacity-0 transition-opacity group-hover:opacity-100 md:flex"
        >
          <ChevronLeft className="h-8 w-8" />
        </button>
        <div ref={ref} className="scroll-row flex gap-3 overflow-x-auto px-4 sm:px-6 pb-2">
          {channels.map((c) => <ChannelCard key={c.id} channel={c} />)}
        </div>
        <button
          onClick={() => scroll("right")}
          aria-label="Scroll right"
          className="absolute right-0 top-0 z-10 hidden h-full w-12 items-center justify-center bg-gradient-to-l from-background/90 to-transparent opacity-0 transition-opacity group-hover:opacity-100 md:flex"
        >
          <ChevronRight className="h-8 w-8" />
        </button>
      </div>
    </section>
  );
}
