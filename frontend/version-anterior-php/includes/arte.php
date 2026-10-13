<?php
/**
 * Ilustraciones decorativas de la interfaz (todo SVG en línea, sin imágenes
 * externas). Solo dibujan; no tocan la base de datos ni la sesión.
 */

/** Granos de café esparcidos (devuelve el contenido de un <svg>). */
function arte_granos(int $cantidad, int $semilla, int $ancho, int $alto, string $id): string
{
    mt_srand($semilla);
    $o  = '<defs><linearGradient id="' . $id . 'g" x1="0" y1="0" x2="1" y2="1">'
        . '<stop offset="0" stop-color="#6b3d24"/><stop offset="1" stop-color="#2b160c"/>'
        . '</linearGradient></defs>';

    for ($i = 0; $i < $cantidad; $i++) {
        $x = mt_rand(0, $ancho);
        $y = mt_rand(0, $alto);
        $a = mt_rand(0, 359);
        $s = mt_rand(80, 125) / 100;
        $o .= '<g transform="translate(' . $x . ' ' . $y . ') rotate(' . $a . ') scale(' . $s . ')">'
            . '<ellipse rx="17" ry="11" fill="url(#' . $id . 'g)"/>'
            . '<ellipse rx="17" ry="11" fill="none" stroke="#9a6a48" stroke-opacity=".35"/>'
            . '<path d="M-15 0 C-6 -5 6 5 15 0" fill="none" stroke="#150a05" stroke-width="2" stroke-linecap="round"/>'
            . '</g>';
    }
    return $o;
}

/** Degradados que usa la taza (se definen una vez por cada <svg>). */
function arte_defs_taza(string $id): string
{
    return '<defs>'
        . '<radialGradient id="' . $id . 'pl" cx=".5" cy=".4" r=".7"><stop offset="0" stop-color="#f6f4f0"/><stop offset="1" stop-color="#c9c4ba"/></radialGradient>'
        . '<radialGradient id="' . $id . 'tz" cx=".5" cy=".4" r=".7"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#d8d3ca"/></radialGradient>'
        . '<radialGradient id="' . $id . 'cf" cx=".45" cy=".35" r=".75"><stop offset="0" stop-color="#dfa96d"/><stop offset=".6" stop-color="#b8752f"/><stop offset="1" stop-color="#7b431c"/></radialGradient>'
        . '</defs>';
}

/** Taza vista desde arriba con arte latte; centrada en (0,0), radio del plato = 180. */
function arte_taza(string $id): string
{
    $corazon = 'M0 40 C-50 5 -46 -45 -18 -45 C-8 -45 0 -38 0 -30 C0 -38 8 -45 18 -45 C46 -45 50 5 0 40 Z';
    return '<circle r="184" cy="10" fill="#000" opacity=".28"/>'
        . '<circle r="180" fill="url(#' . $id . 'pl)"/>'
        . '<circle r="142" fill="none" stroke="#d6d1c7" stroke-width="3"/>'
        . '<path d="M-100 -22 H-146 Q-172 -22 -172 2 Q-172 26 -146 26 H-100" fill="none" stroke="#bfb9ae" stroke-width="24" stroke-linecap="round"/>'
        . '<path d="M-100 -22 H-146 Q-172 -22 -172 2 Q-172 26 -146 26 H-100" fill="none" stroke="#f4f1ec" stroke-width="18" stroke-linecap="round"/>'
        . '<circle r="114" fill="url(#' . $id . 'tz)"/>'
        . '<circle r="94" fill="#f7f5f1" stroke="#cfcac1"/>'
        . '<circle r="84" fill="url(#' . $id . 'cf)"/>'
        . '<path d="' . $corazon . '" fill="#f6e9d4" opacity=".95" transform="translate(0 -2) scale(1.25)"/>'
        . '<path d="' . $corazon . '" fill="#b8752f" opacity=".85" transform="translate(0 2) scale(.85)"/>'
        . '<path d="' . $corazon . '" fill="#f6e9d4" transform="translate(0 6) scale(.5)"/>';
}

/** Ilustración grande del hero: granos + taza con arte latte. */
function arte_hero(string $id = 'hero'): string
{
    mt_srand(11);
    $especias = '';
    for ($i = 0; $i < 45; $i++) {
        $especias .= '<circle cx="' . mt_rand(20, 330) . '" cy="' . mt_rand(60, 300) . '" r="' . (mt_rand(8, 22) / 10)
                   . '" fill="#d2691e" opacity="' . (mt_rand(35, 80) / 100) . '"/>';
    }

    return '<svg viewBox="0 0 640 560" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" role="presentation">'
        . arte_defs_taza($id)
        . arte_granos(170, 7, 640, 560, $id . 'b')
        . $especias
        . '<g transform="translate(395 285) scale(.72)">' . arte_taza($id) . '</g>'
        . '</svg>';
}

/** Icono lineal para la franja de categorías, según palabras del nombre. */
function icono_categoria(string $nombre): string
{
    $n = mb_strtolower($nombre);
    $atr = 'viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';

    if (preg_match('/postre|dulce|torta|pastel|helado|gelatina/u', $n)) {
        return '<svg ' . $atr . '><path d="M7 33h26M9 33V22h22v11M9 27c3 2 5 2 7 0s5-2 7 0 5 2 8 0"/><path d="M20 22v-6M20 16c-1.5-1.5-1.5-3 0-4.5 1.5 1.5 1.5 3 0 4.5Z"/></svg>';
    }
    if (preg_match('/comida|caliente|plato|almuerzo|salte|sandwich|sándwich/u', $n)) {
        return '<svg ' . $atr . '><circle cx="21" cy="22" r="10"/><circle cx="21" cy="22" r="5.5"/><path d="M6 9v7a2.5 2.5 0 0 0 2.5 2.5M11 9v9.5M6 13h5M8.5 18.5V33M35 9c-3 2-4 6-4 10h4v14"/></svg>';
    }
    if (preg_match('/snack|galleta|bocadillo|aperitivo/u', $n)) {
        return '<svg ' . $atr . '><path d="M11 14h18l-2 20H13L11 14Z"/><path d="M9 14h22M12 9h16v5H12z"/></svg>';
    }
    // Bebidas, café y cualquier categoría nueva.
    return '<svg ' . $atr . '><path d="M8 17h20v8a8 8 0 0 1-8 8h-4a8 8 0 0 1-8-8v-8Z"/><path d="M28 19h2.5a3.5 3.5 0 0 1 0 7H28"/><path d="M14 8c0 2-2 2-2 4M20 8c0 2-2 2-2 4M26 8c0 2-2 2-2 4"/></svg>';
}
