// Shared bits for the OLED clocks: options from CLASSIC_CONFIG, time/date
// formatting, and burn-in protection. Every clock lives in one box that
// slowly drifts to a new random spot every minute (like the clocks on OLED
// TVs) unless pinned to a spot, is never full white unless asked, and keeps
// the rest of the screen pure black so those pixels stay off.

const CLOCK_FONTS = {
    sans: { family: "'Noto Sans', 'Cantarell', 'DejaVu Sans', sans-serif", weight: 400 },
    thin: { family: "'Noto Sans', 'Cantarell', 'DejaVu Sans', sans-serif", weight: 200 },
    serif: { family: "'Noto Serif', 'DejaVu Serif', serif", weight: 400 },
    mono: { family: "'Noto Sans Mono', 'DejaVu Sans Mono', monospace", weight: 400 },
};
const CLOCK_SIZES = { s: 0.65, m: 0.85, l: 1, xl: 1.25 };
const DRIFT_EVERY_MS = 60 * 1000;
const DRIFT_MOVE_MS = 20 * 1000;
// Pinned spots as a percentage of the free space (0 = left/top, 100 = right/bottom).
const CLOCK_SPOTS = {
    'center': [ 50, 50 ],
    'top-left': [ 0, 0 ], 'top': [ 50, 0 ], 'top-right': [ 100, 0 ],
    'left': [ 0, 50 ], 'right': [ 100, 50 ],
    'bottom-left': [ 0, 100 ], 'bottom': [ 50, 100 ], 'bottom-right': [ 100, 100 ],
};

const Clock = ( () =>
{
    const cfg = window.CLASSIC_CONFIG || {};
    const locale = cfg.locale || undefined;
    const font = CLOCK_FONTS[ cfg.font ] || CLOCK_FONTS.thin;
    const hour12 = cfg.hours === '12';

    let timeFmt;
    let dateFmt;
    try
    {
        timeFmt = new Intl.DateTimeFormat( locale, { hour: '2-digit', minute: '2-digit', hour12 } );
        dateFmt = new Intl.DateTimeFormat( locale, { weekday: 'long', day: 'numeric', month: 'long' } );
    }
    catch ( e )
    {
        timeFmt = new Intl.DateTimeFormat( undefined, { hour: '2-digit', minute: '2-digit', hour12 } );
        dateFmt = new Intl.DateTimeFormat( undefined, { weekday: 'long', day: 'numeric', month: 'long' } );
    }

    /** "21:47" (or "9:47" + "PM"), seconds "05", and the date line. */
    function Parts( d )
    {
        const parts = timeFmt.formatToParts( d );
        const pick = ( type ) => ( parts.find( p => p.type === type ) || {} ).value || '';
        let hour = pick( 'hour' );
        if ( hour12 )
            hour = String( Number( hour ) );
        return {
            hm: `${ hour }:${ pick( 'minute' ) }`,
            ampm: hour12 ? pick( 'dayPeriod' ) : '',
            s: String( d.getSeconds() ).padStart( 2, '0' ),
            date: dateFmt.format( d ),
        };
    }

    /** Place `el` (absolutely placed): drifting to a random spot every minute
     *  (the default, kind to OLED panels) or pinned where the options say. */
    function Drift( el )
    {
        el.style.position = 'absolute';
        el.style.left = '0';
        el.style.top = '0';
        el.style.willChange = 'transform';
        const pinned = cfg.motion === 'fixed';
        const spot = CLOCK_SPOTS[ cfg.position ] || ( cfg.position === 'custom' ? null : CLOCK_SPOTS.center );
        const Move = ( instant ) =>
        {
            const margin = Math.min( innerWidth, innerHeight ) * 0.04;
            const freeW = Math.max( 0, innerWidth - el.offsetWidth - margin * 2 );
            const freeH = Math.max( 0, innerHeight - el.offsetHeight - margin * 2 );
            let fx = Math.random();
            let fy = Math.random();
            if ( pinned )
            {
                const px = spot ? spot[ 0 ] : Number( cfg.x );
                const py = spot ? spot[ 1 ] : Number( cfg.y );
                fx = Math.min( 100, Math.max( 0, isNaN( px ) ? 50 : px ) ) / 100;
                fy = Math.min( 100, Math.max( 0, isNaN( py ) ? 50 : py ) ) / 100;
            }
            const x = margin + fx * freeW;
            const y = margin + fy * freeH;
            el.style.transition = instant ? 'none' : `transform ${ DRIFT_MOVE_MS }ms ease-in-out`;
            el.style.transform = `translate(${ x.toFixed( 1 ) }px, ${ y.toFixed( 1 ) }px)`;
        };
        Move( true );
        if ( !pinned )
            setInterval( () => Move( false ), DRIFT_EVERY_MS );
        addEventListener( 'resize', () => Move( true ) );
        return Move;
    }

    /** Call fn now and at every second boundary. */
    function EverySecond( fn )
    {
        const Tick = () =>
        {
            fn( new Date() );
            setTimeout( Tick, 1000 - ( Date.now() % 1000 ) + 5 );
        };
        Tick();
    }

    /** A box for the clock, dimmed and themed, appended to the page. */
    function Box()
    {
        const el = document.createElement( 'div' );
        el.className = 'clock';
        el.style.fontFamily = font.family;
        el.style.fontWeight = font.weight;
        el.style.opacity = String( ( cfg.dim || 70 ) / 100 );
        el.style.whiteSpace = 'nowrap';
        el.style.textAlign = 'center';
        el.style.lineHeight = '1';
        el.style.zIndex = '2'; // above an art canvas when used as an overlay
        el.style.pointerEvents = 'none';
        document.body.appendChild( el );
        return el;
    }

    /** vmin in CSS px, so sizes follow the screen (1080p and 4K alike). */
    const Vmin = ( n ) => Math.min( innerWidth, innerHeight ) * n / 100;

    return {
        cfg,
        font,
        scale: CLOCK_SIZES[ cfg.size ] || CLOCK_SIZES.l,
        color: ( fallback ) => cfg.color || fallback,
        color2: ( fallback ) => cfg.color2 || fallback,
        seconds: cfg.seconds === true,
        date: cfg.date !== false,
        Parts,
        Drift,
        EverySecond,
        Box,
        Vmin,
    };
} )();
