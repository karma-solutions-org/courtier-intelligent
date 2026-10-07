/**
 * Makes every transition and animation in the browser finish at once.
 *
 * A retried assertion reads the computed style, and during a transition that is
 * the value part-way along it, not the one the component is heading for. So an
 * assertion on a property the component takes 300ms to reach waits the full
 * 300ms before it can pass -- correctly, but at that price, every time.
 *
 * They are cut to nothing rather than turned off: an element that arrives
 * through an animation, like `.slide`, starts out invisible and only the
 * animation's end state shows it. These tests are about where a component ends
 * up, never about how it travels there, so they jump straight to the end.
 */
const style = document.createElement('style');
style.textContent = `*, *::before, *::after {
  transition-duration: 0s !important;
  transition-delay: 0s !important;
  animation-duration: 0s !important;
  animation-delay: 0s !important;
}`;
document.head.appendChild(style);
