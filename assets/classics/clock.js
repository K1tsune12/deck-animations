// Shared bits for the OLED clocks: options from CLASSIC_CONFIG, time/date
// formatting, and burn-in protection. Every clock lives in one box that
// slowly drifts to a new random spot every minute (like the clocks on OLED
// TVs), is never full white unless asked, and keeps the rest of the screen
// pure black so those pixels stay off.

const CLOCK_FONTS = {
    sans: { family: "'Noto Sans', 'Cantarell', 'DejaVu Sans', sans-serif", weight: 400 },
    thin: { family: "'Noto Sans', 'Cantarell', 'DejaVu Sans', sans-serif", weight: 200 },
    serif: { family: "'Noto Serif', 'DejaVu Serif', serif", weight: 400 },
    mono: { family: "'Noto Sans Mono', 'DejaVu Sans Mono', monospace", weight: 400 },
};
const CLOCK_SIZES = { s: 0.65, m: 0.85, l: 1, xl: 1.25 };
const DRIFT_EVERY_MS = 60 * 1000;
const DRIFT_MOVE_MS = 20 * 1000;

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

    /** Move `el` (absolutely placed) to a random spot that keeps it on screen. */
    function Drift( el )
    {
        el.style.position = 'absolute';
        el.style.left = '0';
        el.style.top = '0';
        el.style.willChange = 'transform';
        const Move = ( instant ) =>
        {
            const margin = Math.min( innerWidth, innerHeight ) * 0.04;
            const w = el.offsetWidth;
            const h = el.offsetHeight;
            const x = margin + Math.random() * Math.max( 0, innerWidth - w - margin * 2 );
            const y = margin + Math.random() * Math.max( 0, innerHeight - h - margin * 2 );
            el.style.transition = instant ? 'none' : `transform ${ DRIFT_MOVE_MS }ms ease-in-out`;
            el.style.transform = `translate(${ x.toFixed( 1 ) }px, ${ y.toFixed( 1 ) }px)`;
        };
        Move( true );
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
