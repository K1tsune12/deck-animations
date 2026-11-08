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
const CLOCK_SPEEDS = { slow: 0.5, normal: 1, fast: 2.5 };
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

    /** Place `el` (absolutely placed) the way the options say:
     *  drift  - slide to a new random spot every so often (default, kind to OLED panels)
     *  bounce - travel in a straight line and bounce off the edges
     *  float  - wander smoothly without ever stopping
     *  fixed  - pinned at a preset spot or a custom x/y
     *  `speed` (slow / normal / fast) scales the three moving ones. */
    function Drift( el )
    {
        el.style.position = 'absolute';
        el.style.left = '0';
        el.style.top = '0';
        el.style.willChange = 'transform';
        const motion = [ 'drift', 'bounce', 'float', 'fixed' ].includes( cfg.motion ) ? cfg.motion : 'drift';
        const speed = CLOCK_SPEEDS[ cfg.speed ] || CLOCK_SPEEDS.normal;
        const spot = CLOCK_SPOTS[ cfg.position ] || ( cfg.position === 'custom' ? null : CLOCK_SPOTS.center );

        /** The rectangle the box may occupy: [margin, free width, free height]. */
        const Free = () =>
        {
            const margin = Math.min( innerWidth, innerHeight ) * 0.04;
            return [ margin, Math.max( 0, innerWidth - el.offsetWidth - margin * 2 ), Math.max( 0, innerHeight - el.offsetHeight - margin * 2 ) ];
        };
        const Put = ( x, y, ms ) =>
        {
            el.style.transition = ms ? `transform ${ ms }ms ease-in-out` : 'none';
            el.style.transform = `translate(${ x.toFixed( 1 ) }px, ${ y.toFixed( 1 ) }px)`;
        };

        if ( motion === 'fixed' )
        {
            const Move = () =>
            {
                const [ margin, freeW, freeH ] = Free();
                const px = spot ? spot[ 0 ] : Number( cfg.x );
                const py = spot ? spot[ 1 ] : Number( cfg.y );
                const fx = Math.min( 100, Math.max( 0, isNaN( px ) ? 50 : px ) ) / 100;
                const fy = Math.min( 100, Math.max( 0, isNaN( py ) ? 50 : py ) ) / 100;
                Put( margin + fx * freeW, margin + fy * freeH, 0 );
            };
            Move();
            addEventListener( 'resize', Move );
            return Move;
        }

        if ( motion === 'drift' )
        {
            const Move = ( instant ) =>
            {
                const [ margin, freeW, freeH ] = Free();
                Put( margin + Math.random() * freeW, margin + Math.random() * freeH, instant ? 0 : DRIFT_MOVE_MS / speed );
            };
            Move( true );
            setInterval( () => Move( false ), DRIFT_EVERY_MS / speed );
            addEventListener( 'resize', () => Move( true ) );
            return Move;
        }

        // bounce and float: a frame loop, in CSS px per second scaled by the screen
        let [ margin, freeW, freeH ] = Free();
        let x = margin + Math.random() * freeW;
        let y = margin + Math.random() * freeH;
        const Resize = () => { [ margin, freeW, freeH ] = Free(); };
        addEventListener( 'resize', Resize );
        // the box is empty on the first frame (text arrives a tick later), so re-measure for a while
        let settle = 0;

        if ( motion === 'bounce' )
        {
            const angle = Math.random() * Math.PI * 2;
            let vx = Math.cos( angle );
            let vy = Math.sin( angle );
            if ( Math.abs( vy ) < 0.3 ) vy = vy < 0 ? -0.3 : 0.3; // never nearly horizontal: boring
            RunLoop( ( dt ) =>
            {
                if ( settle++ < 90 ) Resize();
                const v = Vmin( 7 ) * speed; // px/s
                x += vx * v * dt;
                y += vy * v * dt;
                const maxX = margin + freeW;
                const maxY = margin + freeH;
                if ( x < margin ) { x = margin; vx = Math.abs( vx ); }
                if ( x > maxX ) { x = maxX; vx = -Math.abs( vx ); }
                if ( y < margin ) { y = margin; vy = Math.abs( vy ); }
                if ( y > maxY ) { y = maxY; vy = -Math.abs( vy ); }
                Put( x, y, 0 );
            } );
            return Resize;
        }

        // float: two slow sine waves per axis, never the same path twice
        const p = [ Math.random() * 7, Math.random() * 7, Math.random() * 7, Math.random() * 7 ];
        let t = Math.random() * 1000;
        RunLoop( ( dt ) =>
        {
            if ( settle++ < 90 ) Resize();
            t += dt * 0.05 * speed;
            const fx = 0.5 + 0.5 * ( Math.sin( t * 1.0 + p[ 0 ] ) * 0.6 + Math.sin( t * 2.3 + p[ 1 ] ) * 0.4 );
            const fy = 0.5 + 0.5 * ( Math.sin( t * 1.3 + p[ 2 ] ) * 0.6 + Math.sin( t * 1.9 + p[ 3 ] ) * 0.4 );
            Put( margin + fx * freeW, margin + fy * freeH, 0 );
        } );
        return Resize;
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
