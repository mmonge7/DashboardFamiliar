// Secciones del supermercado, como la lista de la compra de Recordatorios del iPhone:
// cada producto se clasifica solo («pollo» → Carne) y la lista se agrupa en el orden en que se recorre la tienda.
// Si una clasificación no os cuadra, se cambia a mano y se recuerda para ese producto (en Cloudflare, para
// todos los dispositivos; sin servidor, solo en este).
import { server, cached } from '../api.js';
import { isDemo, cachePut } from '../store.js';

export const SECCIONES = [
  { id: 'fruta', nombre: 'Frutas y verduras', icono: '🥬' },
  { id: 'pan', nombre: 'Panadería', icono: '🥖' },
  { id: 'carne', nombre: 'Carne', icono: '🥩' },
  { id: 'pescado', nombre: 'Pescado y marisco', icono: '🐟' },
  { id: 'charcuteria', nombre: 'Charcutería y quesos', icono: '🧀' },
  { id: 'lacteos', nombre: 'Lácteos y huevos', icono: '🥛' },
  { id: 'despensa', nombre: 'Despensa', icono: '🥫' },
  { id: 'especias', nombre: 'Aceites, especias y salsas', icono: '🧂' },
  { id: 'desayuno', nombre: 'Desayuno y dulces', icono: '☕' },
  { id: 'snacks', nombre: 'Frutos secos y snacks', icono: '🥜' },
  { id: 'congelados', nombre: 'Congelados', icono: '🧊' },
  { id: 'bebidas', nombre: 'Bebidas', icono: '🥤' },
  { id: 'limpieza', nombre: 'Limpieza y hogar', icono: '🧽' },
  { id: 'higiene', nombre: 'Higiene y cuidado personal', icono: '🧴' },
  { id: 'bebe', nombre: 'Bebé', icono: '🍼' },
  { id: 'mascotas', nombre: 'Mascotas', icono: '🐾' },
  { id: 'otros', nombre: 'Otros', icono: '🛒' },
];
export const SECCION = Object.fromEntries(SECCIONES.map((s) => [s.id, s]));

// Palabras clave en singular y sin tildes, separadas por comas (también encajan en plural). Si varias encajan,
// gana la de más palabras: «harina de avena» → Despensa, «leche de avena» → Lácteos, «helado» → Congelados…
const PALABRAS = {
  fruta: `fruta, verdura, manzana, pera, platano, banana, naranja, mandarina, limon, lima, uva, fresa, freson, frambuesa,
    arandano, mora, cereza, kiwi, pina, melon, sandia, mango, papaya, aguacate, melocoton, nectarina, albaricoque, ciruela,
    granada, higo, caqui, chirimoya, tomate, tomate cherry, lechuga, canonigo, rucula, espinaca, acelga, col, coliflor,
    brocoli, repollo, lombarda, kale, berza, zanahoria, cebolla, cebolleta, puerro, ajo, pimiento, pepino, calabacin,
    calabaza, berenjena, patata, boniato, batata, champinon, seta, judia verde, guisante, alcachofa, esparrago, apio,
    rabano, remolacha, jengibre, perejil, cilantro, albahaca, hierbabuena, menta, eneldo, maiz dulce, ensalada, brote,
    germinado, endibia, escarola, nabo, chirivia, hinojo, edamame`,
  pan: `pan, barra de pan, baguette, chapata, hogaza, pan de molde, pan integral, bollo, croissant, cruasan, napolitana,
    ensaimada, magdalena, bizcocho, tosta, tostada, biscote, pan tostado, wasa, tosta wasa, picos, regana, colin,
    pan rallado, tortilla de trigo, wrap, pita, pan de pita, brioche`,
  carne: `carne, pollo, pechuga, pechuga de pollo, muslo, contramuslo, alita, pavo, ternera, vaca, buey, filete, solomillo,
    lomo, cerdo, costilla, chuleta, secreto, presa, pluma, carrillera, cordero, conejo, carne picada, picada, hamburguesa,
    albondiga, salchicha, butifarra, chistorra, morcilla, entrecot, redondo, aguja, falda, codillo, higado, pato, codorniz,
    osobuco, cinta de lomo, escalope`,
  pescado: `pescado, merluza, bacalao, salmon, atun, bonito, dorada, lubina, rape, lenguado, gallo, sardina, boqueron,
    anchoa, caballa, trucha, emperador, pez espada, rodaballo, sepia, calamar, pulpo, chipiron, gamba, langostino,
    camaron, mejillon, almeja, berberecho, navaja, vieira, marisco, surimi, palito de cangrejo, cangrejo, bogavante,
    necora, percebe, abadejo, panga, perca`,
  charcuteria: `jamon, jamon serrano, jamon iberico, jamon york, jamon cocido, pavo en lonchas, pechuga de pavo, chorizo,
    salchichon, fuet, lomo embuchado, mortadela, salami, bacon, panceta, cecina, sobrasada, queso, queso curado,
    queso semicurado, queso tierno, queso rallado, queso en lonchas, mozzarella, burrata, parmesano, manchego, brie,
    camembert, cheddar, gouda, emmental, roquefort, queso de cabra, queso azul, pate, foie, embutido`,
  lacteos: `leche, yogur, yogurt, yogur griego, kefir, nata, mantequilla, margarina, huevo, clara, clara de huevo,
    queso fresco, queso batido, queso fresco batido, requeson, cuajada, natillas, flan, arroz con leche, cottage, skyr,
    leche de avena, leche de soja, leche de almendra, bebida vegetal, bebida de avena, bebida de soja, batido de proteina`,
  despensa: `arroz, pasta, macarron, espagueti, spaghetti, tallarin, fideo, lasana, canelon, tortellini, ravioli, cuscus,
    quinoa, garbanzo, lenteja, alubia, judia blanca, judia pinta, legumbre, harina, harina de avena, harina de trigo,
    maicena, levadura, avena, copos de avena, salvado, conserva, lata, atun en lata, tomate frito, tomate triturado,
    tomate natural, pimiento del piquillo, aceituna, pepinillo, alcaparra, caldo, caldo de pollo, caldo de verduras,
    pure, sopa, gazpacho, salmorejo, leche de coco, garbanzos cocidos, lentejas cocidas, tortita de maiz, nachos`,
  especias: `aceite, aceite de oliva, aceite de girasol, vinagre, sal, pimienta, pimenton, oregano, comino, curry, canela,
    nuez moscada, tomillo, romero, laurel, azafran, colorante, especia, caldo en pastilla, avecrem, mayonesa, ketchup,
    mostaza, salsa, salsa de soja, tabasco, alioli, pesto, barbacoa, guacamole, hummus, edulcorante, sacarina`,
  desayuno: `cafe, cafe molido, capsula de cafe, capsula, descafeinado, te, infusion, manzanilla, poleo, cacao, cola cao,
    colacao, nesquik, chocolate, chocolate negro, galleta, cereal, muesli, granola, mermelada, miel, azucar,
    crema de cacahuete, nocilla, nutella, crema de cacao, tortita, donut, gominola, chuche, golosina, caramelo, chicle, turron, polvoron`,
  snacks: `fruto seco, frutos secos, nuez, nueces, almendra, avellana, anacardo, pistacho, cacahuete, pipa, pinon, macadamia, pasa,
    datil, orejon, patata frita, patatas fritas, snack, palomita, tortita de arroz, barrita, barrita de proteina, kikos,
    aperitivo, galleta salada, crackers`,
  congelados: `congelado, helado, pizza, pizza congelada, croqueta, empanadilla, varitas de merluza, guisantes congelados,
    verdura congelada, hielo, lasana congelada, nugget, san jacobo, patatas congeladas`,
  bebidas: `agua, agua con gas, refresco, coca cola, fanta, sprite, nestea, aquarius, zumo, batido, cerveza, vino,
    vino tinto, vino blanco, cava, sidra, ginebra, ron, whisky, vodka, licor, tonica, gaseosa, bebida isotonica,
    bebida energetica, red bull, monster, kombucha, mosto`,
  limpieza: `detergente, suavizante, lavavajillas, pastilla lavavajillas, fregasuelos, lejia, amoniaco, limpiacristales,
    limpiador, multiusos, quitagrasas, estropajo, bayeta, fregona, escoba, recogedor, papel de cocina, papel higienico,
    servilleta, bolsa de basura, papel de aluminio, papel film, papel de horno, ambientador, insecticida, pila, bombilla,
    vela, cerilla, mechero, guante, sal lavavajillas, abrillantador, antical`,
  higiene: `champu, gel, gel de ducha, jabon, jabon de manos, desodorante, pasta de dientes, dentifrico, cepillo de dientes,
    enjuague bucal, colutorio, seda dental, hilo dental, crema hidratante, protector solar, crema solar, cuchilla,
    maquinilla, espuma de afeitar, compresa, tampon, salvaslip, panuelo, algodon, bastoncillo, tirita, toallita,
    desmaquillante, colonia, perfume, laca, gomina, acondicionador, mascarilla`,
  bebe: `panal, toallitas de bebe, potito, papilla, leche de continuacion, leche infantil, biberon, tetina, chupete,
    crema del panal`,
  mascotas: `pienso, comida de perro, comida de gato, arena para gatos, arena de gato, snack para perro, lata de gato,
    golosina para perro`,
};

const strip = (s) => String(s || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
/** Nombre del producto sin la cantidad («Pollo · 320 g» → «pollo»): es la clave de las secciones aprendidas. */
export function productKey(producto) {
  return strip(String(producto).split(/\s+[·(]|\s+-\s+|,/)[0]).replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const RULES = Object.entries(PALABRAS).flatMap(([sec, txt]) => strip(txt).split(',')
  .map((p) => p.replace(/\s+/g, ' ').trim()).filter(Boolean)
  .map((p) => ({ sec, p, n: p.split(' ').length, re: new RegExp(`(^|\\s)${p.split(' ').map((w) => `${esc(w)}(?:s|es)?`).join(' ')}(?=\\s|$)`) })));

/** Sección de un producto: la que eligió la familia, o la que dicen las palabras clave, o «Otros». */
export function classify(producto, aprendidas = {}) {
  const key = productKey(producto);
  if (aprendidas[key] && SECCION[aprendidas[key]]) return aprendidas[key];
  let best = null;
  for (const r of RULES) {
    const m = r.re.exec(key);
    if (!m) continue;
    // Más palabras gana; a igualdad, la que aparece antes («pollo al curry» → pollo)
    const score = r.n * 1000 - m.index + r.p.length / 100;
    if (!best || score > best.score) best = { sec: r.sec, score };
  }
  return best ? best.sec : 'otros';
}

/** Agrupa los productos por sección, en el orden del recorrido por la tienda. */
export function groupByAisle(items, aprendidas = {}) {
  const groups = new Map(SECCIONES.map((s) => [s.id, []]));
  for (const it of items) groups.get(classify(it.producto, aprendidas)).push(it);
  return SECCIONES.filter((s) => groups.get(s.id).length).map((s) => ({ ...s, items: groups.get(s.id) }));
}

// ---------- Secciones aprendidas (lo que se cambia a mano) ----------
const KEY_LOCAL = 'casa.secciones.v1';
const local = () => { try { return JSON.parse(localStorage.getItem(KEY_LOCAL) || '{}') || {}; } catch { return {}; } };
let serverOk = true;

export async function loadAprendidas({ force = false } = {}) {
  if (isDemo()) return local();
  const res = await cached('secciones', 10 * 60000, async () => {
    try { return await server('compra/secciones'); } catch (e) { if (e.status === 404) { serverOk = false; return local(); } throw e; }
  }, { force });
  return res.data || local();
}

export async function setSeccion(producto, seccion, aprendidas) {
  const key = productKey(producto);
  const next = { ...aprendidas };
  if (seccion) next[key] = seccion; else delete next[key];
  if (isDemo() || !serverOk) {
    try { localStorage.setItem(KEY_LOCAL, JSON.stringify(next)); } catch { /* sin espacio */ }
  } else {
    await server('compra/secciones', { method: 'POST', body: { producto: key, seccion: seccion || '' } });
    cachePut('secciones', next);
  }
  return next;
}
