// Shared bits for the generated "classic" screensavers: a full-screen canvas
// sized for the device pixel ratio, and a frame loop with a clamped dt,
// capped at 30 fps (half the work of 60, and these animations are slow).

const MAX_STEP_SEC = 0.1;
const FRAME_MS = 1000 / 30 - 2; // slack so a 60 Hz display reliably hits every other vsync

function CreateCanvas()
{
    const canvas = document.createElement( 'canvas' );
    document.body.appendChild( canvas );
    const ctx = canvas.getContext( '2d' );
    const view = { canvas, ctx, width: 0, height: 0, onResize: null };

    const Resize = () =>
    {
        const dpr = window.devicePixelRatio || 1;
        view.width = window.innerWidth;
        view.height = window.innerHeight;
        canvas.width = Math.round( view.width * dpr );
        canvas.height = Math.round( view.height * dpr );
        ctx.setTransform( dpr, 0, 0, dpr, 0, 0 );
        view.onResize && view.onResize();
    };
    window.addEventListener( 'resize', Resize );
    Resize();
    return view;
}

// "End after N minutes" (endless screensavers only): fade to black, then stop
// drawing, so an OLED panel shows nothing at all.
let Ended = false;
window.addEventListener( 'DOMContentLoaded', () =>
{
    const sec = ( window.CLASSIC_CONFIG || {} ).endAfterSec;
    if ( !sec )
        return;
    setTimeout( () =>
    {
        const veil = document.createElement( 'div' );
        veil.style.cssText = 'position:fixed;inset:0;background:#000;opacity:0;transition:opacity 3s;z-index:99';
        document.body.appendChild( veil );
        requestAnimationFrame( () => requestAnimationFrame( () => { veil.style.opacity = '1'; } ) );
        setTimeout( () => { Ended = true; }, 3200 );
    }, sec * 1000 );
} );

function RunLoop( step )
{
    let last;
    const Frame = ( now ) =>
    {
        if ( Ended )
            return;
        requestAnimationFrame( Frame );
        if ( last !== undefined && now - last < FRAME_MS )
            return;
        const dt = last === undefined ? 0 : Math.min( ( now - last ) / 1000, MAX_STEP_SEC );
        last = now;
        step( dt, now / 1000 );
    };
    requestAnimationFrame( Frame );
}

/** "#rrggbb" -> [r, g, b]. */
function Hex( hex )
{
    const n = parseInt( String( hex ).slice( 1 ), 16 ) || 0;
    return [ ( n >> 16 ) & 255, ( n >> 8 ) & 255, n & 255 ];
}

function Mix( a, b, t )
{
    return [ a[ 0 ] + ( b[ 0 ] - a[ 0 ] ) * t, a[ 1 ] + ( b[ 1 ] - a[ 1 ] ) * t, a[ 2 ] + ( b[ 2 ] - a[ 2 ] ) * t ];
}

function Rgba( c, alpha )
{
    return `rgba(${ c[ 0 ] | 0 }, ${ c[ 1 ] | 0 }, ${ c[ 2 ] | 0 }, ${ alpha })`;
}

/** The two colours of a screensaver: CLASSIC_CONFIG color/color2 or defaults. */
function Palette( def1, def2 )
{
    const cfg = window.CLASSIC_CONFIG || {};
    return [ Hex( cfg.color || def1 ), Hex( cfg.color2 || def2 ) ];
}

/** 1 on a full screen (Deck 800p, TV 1080p, as designed); smaller in a small
 *  page such as a thumbnail, so pixel sizes and speeds keep their proportions. */
function Scale()
{
    return Math.min( 1, Math.min( window.innerWidth, window.innerHeight ) / 800 );
}

function Rand( min, max )
{
    return min + Math.random() * ( max - min );
}

function RandInt( max )
{
    return Math.floor( Math.random() * max );
}
