/** All portfolio content in both languages. Edit this file to update the site. */
export type Lang = 'en' | 'es';
export type L<T = string> = Record<Lang, T>;

export interface Course {
  id: string;
  dept: 'CS' | 'MATH' | 'STAT' | 'ECON';
  /** Short title for the hanging sign (kept in English: official course names) */
  sign: string;
  title: L;
  topics: L<string[]>;
}

export const COURSES: Course[] = [
  {
    id: 'resp-ai', dept: 'CS', sign: 'Responsible\nAI',
    title: { en: 'Responsible AI', es: 'IA Responsable' },
    topics: {
      en: ['Fairness & bias in ML', 'Data privacy', 'Differential privacy', 'LLM risks & the state of AI research', 'Interpretability & explainability'],
      es: ['Equidad y sesgo en ML', 'Privacidad de datos', 'Privacidad diferencial', 'Riesgos de los LLM y el estado de la investigación en IA', 'Interpretabilidad y explicabilidad'],
    },
  },
  {
    id: 'nlp', dept: 'CS', sign: 'Natural Language\nProcessing',
    title: { en: 'Natural Language Processing', es: 'Procesamiento de Lenguaje Natural' },
    topics: {
      en: ['RNNs & Transformers', 'LLM fine-tuning', 'Retrieval-Augmented Generation', 'LLM mixture models', 'CKY parsing algorithm', 'Sentiment & language', 'Smoothing'],
      es: ['RNNs y Transformers', 'Fine-tuning de LLMs', 'Generación aumentada por recuperación (RAG)', 'Modelos de mezcla de LLMs', 'Algoritmo de parsing CKY', 'Sentimiento y lenguaje', 'Suavizado (smoothing)'],
    },
  },
  {
    id: 'ai', dept: 'CS', sign: 'Foundations\nof AI',
    title: { en: 'Foundations of AI', es: 'Fundamentos de IA' },
    topics: {
      en: ['Machine learning algorithms', 'Probabilistic reasoning', 'Search algorithms'],
      es: ['Algoritmos de machine learning', 'Razonamiento probabilístico', 'Algoritmos de búsqueda'],
    },
  },
  {
    id: 'comp-org', dept: 'CS', sign: 'Computer\nOrganization',
    title: { en: 'Computer Organization', es: 'Organización de Computadoras' },
    topics: {
      en: ['Assembly & Y86-64', 'Storage hierarchy', 'Virtual memory', 'Caches', 'Dynamic memory allocation'],
      es: ['Ensamblador y Y86-64', 'Jerarquía de almacenamiento', 'Memoria virtual', 'Cachés', 'Asignación dinámica de memoria'],
    },
  },
  {
    id: 'prob', dept: 'MATH', sign: 'Probability',
    title: { en: 'Probability', es: 'Probabilidad' },
    topics: {
      en: ['Counting methods', 'Conditional & joint probability', 'Discrete & continuous random variables', 'PMF / PDF / CDF', 'Bernoulli, binomial, geometric & hypergeometric', 'Poisson & exponential'],
      es: ['Métodos de conteo', 'Probabilidad condicional y conjunta', 'Variables aleatorias discretas y continuas', 'PMF / PDF / CDF', 'Bernoulli, binomial, geométrica e hipergeométrica', 'Poisson y exponencial'],
    },
  },
  {
    id: 'linalg', dept: 'MATH', sign: 'Linear\nAlgebra',
    title: { en: 'Linear Algebra', es: 'Álgebra Lineal' },
    topics: {
      en: ['Vector spaces & subspaces', 'Matrix operations', 'Projections & orthogonality', 'Linear transformations', 'Eigenvalues & eigenvectors', 'Determinants'],
      es: ['Espacios y subespacios vectoriales', 'Operaciones con matrices', 'Proyecciones y ortogonalidad', 'Transformaciones lineales', 'Valores y vectores propios', 'Determinantes'],
    },
  },
  {
    id: 'stats', dept: 'STAT', sign: 'Statistics &\nData Analysis',
    title: { en: 'Statistics & Data Analysis', es: 'Estadística y Análisis de Datos' },
    topics: {
      en: ['Regression', 'Statistical inference', 'Hypothesis testing', 'Experimental design'],
      es: ['Regresión', 'Inferencia estadística', 'Pruebas de hipótesis', 'Diseño experimental'],
    },
  },
  {
    id: 'discrete', dept: 'MATH', sign: 'Discrete\nMathematics',
    title: { en: 'Discrete Mathematics', es: 'Matemáticas Discretas' },
    topics: {
      en: ['Logic & proof techniques', 'Sets, relations & functions', 'Induction & recursion', 'Combinatorics', 'Graph theory', 'Modular arithmetic'],
      es: ['Lógica y técnicas de demostración', 'Conjuntos, relaciones y funciones', 'Inducción y recursión', 'Combinatoria', 'Teoría de grafos', 'Aritmética modular'],
    },
  },
  {
    id: 'finmkts', dept: 'ECON', sign: 'Financial\nMarkets',
    title: { en: 'Financial Markets, Institutions & Policies', es: 'Mercados Financieros, Instituciones y Políticas' },
    topics: {
      en: ['Bonds & stocks', 'Portfolio design', 'Risk & volatility', 'Capital structure'],
      es: ['Bonos y acciones', 'Diseño de portafolios', 'Riesgo y volatilidad', 'Estructura de capital'],
    },
  },
];

export interface Project { id: string; name: string; tagline: L; stack: string[]; url?: string; }
export const PROJECTS: Project[] = [
  { id: 'lyceo', name: 'Lyceo', tagline: { en: 'AI tutoring platform that learns how you learn. Deployed and in use.', es: 'Plataforma de tutoría con IA que aprende cómo aprendes. Desplegada y en uso.' }, stack: ['Next.js', 'Supabase', 'Claude API', 'Whisper', 'ElevenLabs'], url: 'https://github.com/josemiguelfzcv/eduai' },
  { id: 'visionkeys', name: 'VisionKeys', tagline: { en: 'Eye-tracking accessibility interface built at HackHarvard 2025.', es: 'Interfaz de accesibilidad con seguimiento ocular, construida en HackHarvard 2025.' }, stack: ['Python', 'Computer Vision'], url: 'https://github.com/josemiguelfzcv/Projects' },
  { id: 'schedule', name: 'ScheduleGenerator', tagline: { en: 'Course planner powered by a DAG engine for prerequisites.', es: 'Planificador de cursos con un motor de grafos (DAG) para prerrequisitos.' }, stack: ['Java'], url: 'https://github.com/josemiguelfzcv/Projects' },
  { id: 'montecarlo', name: 'Monte Carlo Option Pricer', tagline: { en: 'Simulation-based pricing of options, with variance reduction.', es: 'Valoración de opciones por simulación, con reducción de varianza.' }, stack: ['Python', 'NumPy'] },
  { id: 'manage', name: 'Manage', tagline: { en: 'Route & client software for small water distributors (first case: my family\'s business).', es: 'Software de rutas y clientes para pequeñas distribuidoras de agua (primer caso: el negocio de mi familia).' }, stack: ['In progress'] },
];

export const ABOUT: L<{ heading: string; beats: { title: string; text: string }[] }> = {
  en: {
    heading: 'Spawn point: Barahona',
    beats: [
      { title: 'Born in Barahona, Dominican Republic', text: 'I grew up around my family\'s business. Near the end of high school I discovered how U.S. college applications worked — and knew that was where I wanted to study. So I took a gap year to build my application from scratch, and it got me to Williams College.' },
      { title: 'Debate, Model Congress, Model UN', text: 'In high school I lived for debate. I arrived at Williams convinced I would study Political Science and Economics.' },
      { title: 'Then came CS 134', text: 'My first computer-science class changed the plan. I fell in love with building things. Today I\'m a Computer Science & Economics major who loves to build — and wants to go deep into developing artificial intelligence.' },
    ],
  },
  es: {
    heading: 'Punto de aparición: Barahona',
    beats: [
      { title: 'Nací en Barahona, República Dominicana', text: 'Crecí alrededor del negocio de mi familia. Casi al terminar la secundaria descubrí cómo funcionaban las aplicaciones a universidades en EE. UU., y tuve claro que quería estudiar allá. Me tomé un año sabático para preparar mi aplicación desde cero, y eso me llevó a Williams College.' },
      { title: 'Debate, Modelo de Congreso, Modelo de la ONU', text: 'En secundaria vivía para el debate. Llegué a Williams convencido de que estudiaría Ciencias Políticas y Economía.' },
      { title: 'Y entonces llegó CS 134', text: 'Mi primera clase de computación cambió el plan. Me enamoré de construir cosas. Hoy soy estudiante de Computer Science y Economía al que le encanta construir, y quiero adentrarme en el desarrollo de la inteligencia artificial.' },
    ],
  },
};

export const CONTACT = {
  email: 'jmf11@williams.edu',
  linkedin: 'https://www.linkedin.com/in/jose-feliz-cuevas/',
  github: 'https://github.com/josemiguelfzcv',
};

export const UI: Record<string, L> = {
  loading: { en: 'Loading Jose\'s World', es: 'Cargando el mundo de José' },
  enter: { en: 'Click to enter', es: 'Haz clic para entrar' },
  subtitle: { en: 'José Miguel Féliz · Computer Science & Economics · Williams College', es: 'José Miguel Féliz · Computer Science y Economía · Williams College' },
  start: { en: 'Scroll to explore', es: 'Haz scroll para explorar' },
  startBtn: { en: 'Start the story', es: 'Empezar la historia' },
  chapterSpawn: { en: 'Spawn', es: 'Inicio' },
  chapterHouse: { en: 'About me', es: 'Sobre mí' },
  chapterMine: { en: 'Courses', es: 'Cursos' },
  chapterWorkshop: { en: 'Projects', es: 'Proyectos' },
  chapterLibrary: { en: 'Experience', es: 'Experiencia' },
  chapterEnchant: { en: 'Skills', es: 'Habilidades' },
  chapterPortal: { en: 'Contact', es: 'Contacto' },
  comingSoon: { en: 'Coming soon', es: 'Próximamente' },
  courses: { en: 'Courses · The Nether ride', es: 'Cursos · Viaje por el Nether' },
  topics: { en: 'Topics', es: 'Temas' },
  descend: { en: 'Something is glowing below the floor…', es: 'Algo brilla bajo el suelo…' },
  portalHint: { en: 'Enter the portal', es: 'Entra al portal' },
  endTitle: { en: 'End of Episode 1', es: 'Fin del Episodio 1' },
  endText: { en: 'Projects, experience, skills and the portal are being built. Meanwhile, travel to another world:', es: 'Proyectos, experiencia, habilidades y el portal están en construcción. Mientras tanto, viaja a otro mundo:' },
  email: { en: 'Email', es: 'Correo' },
  sound: { en: 'Sound', es: 'Sonido' },
  language: { en: 'Language', es: 'Idioma' },
  tapHint: { en: 'Click an object to inspect it', es: 'Haz clic en un objeto para verlo' },
  gen1: { en: 'Generating terrain…', es: 'Generando terreno…' },
  gen2: { en: 'Planting trees…', es: 'Plantando árboles…' },
  gen3: { en: 'Building the house…', es: 'Construyendo la casa…' },
  gen4: { en: 'Lighting the Nether…', es: 'Iluminando el Nether…' },
  gen5: { en: 'Waking up the sun…', es: 'Despertando al sol…' },
};
