// Shared bits for the generated "classic" screensavers: a full-screen canvas
// sized for the device pixel ratio, and a frame loop with a clamped dt,
// capped at 30 fps (half the work of 60, and these animations are slow).

const MAX_STEP_SEC = 0.1;
const FRAME_MS = 1000 / 30 - 2; // slack so a 60 Hz display reliably hits every other vsync
const MIN_SIZE = 16; // CSS px; smaller means Steam's view isn't laid out yet
const Views = [];

function CreateCanvas()
{
    const canvas = document.createElement( 'canvas' );
    canvas.style.background = '#000';
    document.body.appendChild( canvas );
    // opaque: clearRect paints black, so the OLED arts (which only clear and
    // add light) never show whatever is behind the page
    const ctx = canvas.getContext( '2d', { alpha: false } );
    const view = { canvas, ctx, width: 0, height: 0, onResize: null, Sync: null };

    // Steam's view can start at 1x1 when it opens over a game and grow
    // without a resize event: a 2x2 canvas stretched over the screen, where
    // the OLED art's added light saturates to white. Until the page has a
    // real size the art sees 0x0 and waits.
    let innerW = -1;
    let innerH = -1;
    let ratio = 0;
    const Resize = () =>
    {
        const dpr = window.devicePixelRatio || 1;
        innerW = window.innerWidth;
        innerH = window.innerHeight;
        ratio = dpr;
        const ready = innerW >= MIN_SIZE && innerH >= MIN_SIZE;
        view.width = ready ? innerW : 0;
        view.height = ready ? innerH : 0;
        canvas.width = Math.max( 1, Math.round( view.width * dpr ) );
        canvas.height = Math.max( 1, Math.round( view.height * dpr ) );
        ctx.setTransform( dpr, 0, 0, dpr, 0, 0 );
        view.onResize && view.onResize();
    };
    // checked every frame, so a size change that never fired an event is caught
    view.Sync = () =>
    {
        if ( window.innerWidth !== innerW || window.innerHeight !== innerH || ( window.devicePixelRatio || 1 ) !== ratio )
            Resize();
    };
    window.addEventListener( 'resize', Resize );
    // the GPU can drop the canvas (e.g. a game needs the memory); once it is
    // back its state is reset, so size and scale it again
    canvas.addEventListener( 'contextrestored', Resize );
    Resize();
    Views.push( view );
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

/** Loads the screensaver's own scripts, in order, once the page has a real
 *  size (see MIN_SIZE): they place everything from the size they start with. */
function StartWhenSized( files )
{
    const Load = ( i ) =>
    {
        if ( i >= files.length )
            return;
        const script = document.createElement( 'script' );
        script.src = `${ files[ i ] }?v=${ Date.now() }`; // never from the cache
        script.onload = script.onerror = () => Load( i + 1 );
        document.body.appendChild( script );
    };
    const Wait = () => ( innerWidth >= MIN_SIZE && innerHeight >= MIN_SIZE ? Load( 0 ) : requestAnimationFrame( Wait ) );
    Wait();
}

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
        for ( const view of Views )
            view.Sync();
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
