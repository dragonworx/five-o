// One year per slide, by position: years[0] belongs to the first slide, and so on.
// Reorder slides freely; the years stay put, so the timeline stays chronological.
const years = [1976, 1981, 1986, 1998, 2003, 2007, 2011, 2017, 2018, 2019, 2026];

// ── Edit captions and reorder freely. Order here is the display order. ──
// Use {year} where the slide's year belongs (caption and alt both).
// Roughly chronological "fifty years in pictures". Add / remove items together
// with their year above and the UI adapts to the array length automatically.
const slides = [
  {
    src: "/img/slides/sperm.jpeg",
    caption: "{year}. First place out of several million.",
    alt: "{year}. First place out of several million",
  },
  {
    src: "/img/slides/young-genius-award.jpeg",
    caption: "{year}. Youngest person ever to NOT need to go to university.",
    alt: "{year}. Youngest person ever to NOT need to go to university.",
  },
  {
    src: "/img/slides/jumped-grand-canyon.jpeg",
    caption: "{year}. Cleared the Grand Canyon on a scooter.",
    alt: "{year}. Cleared the Grand Canyon on a scooter.",
  },
  {
    src: "/img/slides/knights.jpeg",
    caption: "{year}. Cut down the mightiest tree in the forest... wiiiith... a HERRING!",
    alt: "{year}. Cut down the mightiest tree in the forest... wiiiith... a HERRING!",
  },
  {
    src: "/img/slides/chess-boxing.jpeg",
    caption: "{year}. Undefeated chess-boxing champion. Checkmate, then big left hook.",
    alt: "{year}. Undefeated chess-boxing champion. Checkmate, then big left hook.",
  },
  {
    src: "/img/slides/space-walk.jpeg",
    caption: "{year}. Fixed the silver thingy on the International Space Station.",
    alt: "{year}. Fixed the silver thingy on the International Space Station.",
  },
  {
    src: "/img/slides/yodeling.jpeg",
    caption: "{year}. Released critically aclaimed Death Metal Yodelling album 'Yodel Ay Ee BLEGH!'.",
    alt: "{year}. Released critically aclaimed Death Metal Yodelling album 'Yodel Ay Ee BLEGH!'.",
  },
  {
    src: "/img/slides/beethoven.jpeg",
    caption: "{year}. Won a Grammy for collaborating with Beethoven on 'Yodel Ay Ee Fur Elise'.",
    alt: "{year}. Won a Grammy for collaborating with Beethoven on 'Yodel Ay Ee Fur Elise'.",
  },
  {
    src: "/img/slides/starship-troopers.jpeg",
    caption: "{year}. Enlisted to fight the bugs. Would you like to know more?",
    alt: "{year}. Enlisted to fight the bugs. Would you like to know more?",
  },
  {
    src: "/img/slides/trump.jpeg",
    caption: "{year}. Helped Trump FINALLY drain the swamp, HUUUGGE.",
    alt: "{year}. Helped Trump FINALLY drain the swamp, HUUUGGE.",
  },
  {
    src: "/img/slides/illuminati.jpeg",
    caption: "{year}. Finally, inducted into the Illuminati by the lizard people, central coast chapter.",
    alt: "{year}. Finally, inducted into the Illuminati by the lizard people, central coast chapter.",
  },
];

export default {
  autoAdvanceMs: 5200, // 0 disables autoplay
  showProgressBar: true,
  items: slides.map((slide, i) => {
    const year = years[i];
    if (year === undefined) throw new Error(`slides.ts: no year defined for slide ${i} (${slide.src})`);
    const fill = (text: string) => text.replaceAll("{year}", String(year));
    return { ...slide, caption: fill(slide.caption), alt: fill(slide.alt) };
  }),
};
