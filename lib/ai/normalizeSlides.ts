export function normalizeSlides<T>(slides: T[], target: number): T[] {
  if (!Array.isArray(slides) || slides.length === 0) {
    return [];
  }

  if (slides.length > target) {
    return slides.slice(0, target);
  }

  if (slides.length < target) {
    const result = [...slides];
    const lastSlide = slides[slides.length - 1];

    while (result.length < target) {
      result.push(lastSlide);
    }

    return result;
  }

  return slides;
}
