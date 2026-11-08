// Silk: hundreds of light threads flowing along a slowly changing current,
// leaving short trails that fade into the black.

const view = CreateCanvas();
const [ c1, c2 ] = Palette( '#33e6ff', '#ff4dc4' );
const COUNT = 260;
const TRAIL = 18;
const threads = [];

function Reset( th, anywhere )
{
    th.x = Rand( 0, view.width );
    th.y = Rand( 0, view.height );
    th.trail = [];
    th.life = anywhere ? Rand( 0, 1 ) : 0;
    th.span = Rand( 6, 14 ); // seconds it lives
    th.color = Mix( c1, c2, th.y / view.height * 0.7 + Math.random() * 0.3 );
}


/** Direction of the current at a point: smooth layered waves that evolve. */
function Flow( x, y, t, scale )
{
    const nx = x / scale;
    const ny = y / scale;
    return Math.sin( nx * 1.3 + t * 0.07 ) * 1.6
        + Math.cos( ny * 1.7 - t * 0.05 ) * 1.4
        + Math.sin( ( nx + ny ) * 0.9 + t * 0.11 ) * 0.8;
}

RunLoop( ( dt, t ) =>
{
    const { ctx, width, height } = view;
    // spawn once the page has a size (it can be 0 at the very first frame)
    if ( !threads.length && width && height )
    {
        for ( let i = 0; i < COUNT; i++ )
        {
            const th = {};
            Reset( th, true );
            threads.push( th );
        }
    }
    const scale = Math.min( width, height ) / 3;
    const speed = Math.min( width, height ) * 0.06;
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect( 0, 0, width, height );
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineWidth = Math.max( 1, Math.min( width, height ) / 700 );
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for ( const th of threads )
    {
        const a = Flow( th.x, th.y, t, scale );
        th.x += Math.cos( a ) * speed * dt;
        th.y += Math.sin( a ) * speed * dt;
        th.trail.push( th.x, th.y );
        if ( th.trail.length > TRAIL * 2 )
            th.trail.splice( 0, 2 );
        th.life += dt / th.span;
        if ( th.life >= 1 || th.x < -20 || th.x > width + 20 || th.y < -20 || th.y > height + 20 )
        {
            Reset( th, false );
            continue;
        }
        // fade in, then out over the thread's life
        const alpha = Math.sin( th.life * Math.PI ) * 0.55;
        const pts = th.trail;
        if ( pts.length < 4 )
            continue;
        ctx.strokeStyle = Rgba( th.color, alpha );
        ctx.beginPath();
        ctx.moveTo( pts[ 0 ], pts[ 1 ] );
        for ( let i = 2; i < pts.length; i += 2 )
            ctx.lineTo( pts[ i ], pts[ i + 1 ] );
        ctx.stroke();
    }
} );
