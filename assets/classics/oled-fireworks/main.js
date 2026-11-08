// Fireworks: rockets rise and burst into sparks that fall and fade, each
// shell picking a colour between the two chosen ones.

const view = CreateCanvas();
const [ c1, c2 ] = Palette( '#ff4dc4', '#ffb31a' );
window.ART_COLORS = [ c1, c2 ]; // for the optional clock overlay
const rockets = [];
const sparks = [];
let nextLaunch = 0;

function Launch( u )
{
    rockets.push( {
        x: Rand( view.width * 0.15, view.width * 0.85 ),
        y: view.height + u * 2,
        vy: -Rand( 55, 75 ) * u,
        burstY: Rand( view.height * 0.15, view.height * 0.5 ),
        color: Mix( c1, c2, Math.random() ),
    } );
}

function Burst( rocket, u )
{
    const n = RandInt( 50 ) + 60;
    const power = Rand( 18, 30 ) * u;
    const ring = Math.random() < 0.3; // some shells burst in a clean ring
    for ( let i = 0; i < n; i++ )
    {
        const a = ( i / n ) * Math.PI * 2 + Rand( -0.05, 0.05 );
        const speed = ring ? power : power * Math.sqrt( Math.random() );
        sparks.push( {
            x: rocket.x,
            y: rocket.y,
            px: rocket.x,
            py: rocket.y,
            vx: Math.cos( a ) * speed,
            vy: Math.sin( a ) * speed,
            life: 1,
            decay: Rand( 0.35, 0.6 ),
            color: Mix( rocket.color, Math.random() < 0.5 ? c1 : c2, Rand( 0, 0.35 ) ),
        } );
    }
}

RunLoop( ( dt, t ) =>
{
    const { ctx, width, height } = view;
    const u = Math.min( width, height ) / 100;
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect( 0, 0, width, height );
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';

    if ( t >= nextLaunch )
    {
        Launch( u );
        nextLaunch = t + Rand( 0.7, 2.2 );
    }

    for ( let i = rockets.length - 1; i >= 0; i-- )
    {
        const r = rockets[ i ];
        const py = r.y;
        r.y += r.vy * dt;
        ctx.strokeStyle = Rgba( r.color, 0.8 );
        ctx.lineWidth = u * 0.35;
        ctx.beginPath();
        ctx.moveTo( r.x, py + u * 2 );
        ctx.lineTo( r.x, r.y );
        ctx.stroke();
        if ( r.y <= r.burstY )
        {
            Burst( r, u );
            rockets.splice( i, 1 );
        }
    }

    const gravity = 14 * u;
    for ( let i = sparks.length - 1; i >= 0; i-- )
    {
        const s = sparks[ i ];
        s.px = s.x;
        s.py = s.y;
        s.vx *= 1 - 1.4 * dt;
        s.vy = s.vy * ( 1 - 1.4 * dt ) + gravity * dt;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.life -= s.decay * dt;
        if ( s.life <= 0 || s.y > height )
        {
            sparks.splice( i, 1 );
            continue;
        }
        const twinkle = s.life < 0.35 ? ( Math.random() < 0.5 ? 1 : 0.3 ) : 1;
        ctx.strokeStyle = Rgba( s.color, s.life * twinkle );
        ctx.lineWidth = u * ( 0.2 + s.life * 0.35 );
        ctx.beginPath();
        // a short streak from where it was, so fast sparks look like trails
        ctx.moveTo( s.px - s.vx * dt * 2, s.py - s.vy * dt * 2 );
        ctx.lineTo( s.x, s.y );
        ctx.stroke();
    }
} );
