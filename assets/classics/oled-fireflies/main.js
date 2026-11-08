// Fireflies: soft points of light wandering through the dark, each pulsing
// at its own pace. Everything else stays pure black.

const COUNT = 70;
const view = CreateCanvas();
const [ c1, c2 ] = Palette( '#ffd36b', '#9dff6b' );
window.ART_COLORS = [ c1, c2 ]; // for the optional clock overlay
const flies = [];

function Spawn( fly )
{
    fly.x = Rand( 0, view.width );
    fly.y = Rand( 0, view.height );
    fly.angle = Rand( 0, Math.PI * 2 );
    fly.turn = Rand( -0.6, 0.6 );
    fly.speed = Rand( 0.6, 1.8 );
    fly.phase = Rand( 0, Math.PI * 2 );
    fly.rate = Rand( 0.4, 1.3 );
    fly.size = Rand( 0.5, 1.2 );
    fly.color = Mix( c1, c2, Math.random() );
}

RunLoop( ( dt, t ) =>
{
    const { ctx, width, height } = view;
    // spawn once the page has a size (it can be 0 at the very first frame)
    if ( !flies.length && width && height )
    {
        for ( let i = 0; i < COUNT; i++ )
        {
            const fly = {};
            Spawn( fly );
            flies.push( fly );
        }
    }
    const u = Math.min( width, height ) / 100;
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect( 0, 0, width, height );
    ctx.globalCompositeOperation = 'lighter';

    for ( const fly of flies )
    {
        // wander: the heading drifts, now and then changing its mind
        fly.turn += Rand( -1, 1 ) * dt;
        fly.turn = Math.max( -0.9, Math.min( 0.9, fly.turn ) );
        fly.angle += fly.turn * dt;
        fly.x += Math.cos( fly.angle ) * fly.speed * u * dt * 2;
        fly.y += Math.sin( fly.angle ) * fly.speed * u * dt * 2;
        const pad = u * 6;
        if ( fly.x < -pad ) fly.x = width + pad;
        if ( fly.x > width + pad ) fly.x = -pad;
        if ( fly.y < -pad ) fly.y = height + pad;
        if ( fly.y > height + pad ) fly.y = -pad;

        // glow: mostly dim, brightening in slow pulses
        const pulse = Math.pow( 0.5 + 0.5 * Math.sin( t * fly.rate + fly.phase ), 3 );
        const r = u * fly.size * ( 1.6 + pulse * 2.4 );
        const glow = ctx.createRadialGradient( fly.x, fly.y, 0, fly.x, fly.y, r );
        glow.addColorStop( 0, Rgba( fly.color, 0.25 + pulse * 0.75 ) );
        glow.addColorStop( 0.18, Rgba( fly.color, 0.18 + pulse * 0.4 ) );
        glow.addColorStop( 1, Rgba( fly.color, 0 ) );
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc( fly.x, fly.y, r, 0, Math.PI * 2 );
        ctx.fill();
    }
} );
