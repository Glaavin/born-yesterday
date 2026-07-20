import Image from "next/image";

/**
 * The BORN YESTERDAY TECH lockup, assembled from three pre-rendered SVGs
 * (each carries its own baked gradient + glow, so they are referenced as
 * assets rather than inlined — inlining collides on their shared internal
 * gradient/filter IDs).
 *
 * BORN and YESTERDAY share a cap-height; TECH is intentionally smaller and
 * sits tucked to the right, per the mockup. Sizes step up responsively while
 * preserving each word's intrinsic aspect ratio (width auto).
 */
export default function Wordmark() {
  return (
    <div
      className="flex select-none items-center justify-center gap-x-1 sm:gap-x-2"
      role="img"
      aria-label="Born Yesterday Tech"
    >
      <Image
        src="/born-text.svg"
        alt=""
        width={156}
        height={131}
        priority
        className="h-12 w-auto sm:h-16 lg:h-24"
      />
      <Image
        src="/yesterday-text.svg"
        alt=""
        width={349}
        height={130}
        priority
        className="h-12 w-auto sm:h-16 lg:h-24"
      />
      <Image
        src="/tech-text.svg"
        alt=""
        width={105}
        height={91}
        priority
        className="ml-2 h-8 w-auto sm:ml-3 sm:h-11 lg:ml-4 lg:h-16"
      />
    </div>
  );
}
