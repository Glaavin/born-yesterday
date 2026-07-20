import Wordmark from "./Wordmark";
import Mascot, { type MascotState } from "./Mascot";

/**
 * WordmarkMascot — composes the wordmark and the mascot in one positioned
 * container (design-system.md §4.2). Server Component (it only renders the
 * client <Mascot/> as a child).
 *
 * The mascot sits on a HIGHER z-index layer than the wordmark, positioned by
 * percentage of the container — which scales with the wordmark SVG — so the egg
 * stays seated in the "." between YESTERDAY and TECH at any size. The mascot box
 * is fixed-size, so switching `state` swaps the art with NO layout shift.
 */
export default function WordmarkMascot({
  state = "idle",
}: {
  state?: MascotState;
}) {
  return (
    <div className="relative mx-auto w-full max-w-xl lg:max-w-wordmark">
      <Wordmark />
      <div
        className="pointer-events-none absolute z-10"
        style={{
          left: "66.5%",
          top: "59%",
          width: "15%",
          transform: "translate(-50%, -50%)",
        }}
      >
        <Mascot state={state} />
      </div>
    </div>
  );
}
