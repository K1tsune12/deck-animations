// Aurora: curtains of northern lights rippling across a black sky, in two
// colour layers that drift past each other.

const view = CreateCanvas();
const [ c1, c2 ] = Palette( '#33ff99', '#a64dff' );
const STEP = 3; // CSS px per column

/** A 1 px wide vertical light streak, scaled per column: cheap to draw. */
function Streak( color )
{
    const sprite = document.createElement( 'canvas' );
    sprite.width = 1;
    sprite.height = 256;
    const g = sprite.getContext( '2d' );
    const grad = g.createLinearGradient( 0, 0, 0, 256 );
    grad.addColorStop( 0, Rgba( color, 0 ) );
    grad.addColorStop( 0.55, Rgba( color, 0.35 ) );
    grad.addColorStop( 0.85, Rgba( color, 0.9 ) );
    grad.addColorStop( 1, Rgba( color, 0 ) );
    g.fillStyle = grad;
    g.fillRect( 0, 0, 1, 256 );
    return sprite;
}

const layers = [
    { sprite: Streak( c1 ), speed: 0.05, phase: 0, base: 0.5, alpha: 0.55 },
    { sprite: Streak( c2 ), speed: -0.035, phase: 2.1, base: 0.42, alpha: 0.4 },
];

function Wave( x, t, phase )
{
    return Math.sin( x * 2.1 + t * 0.31 + phase ) * 0.5
        + Math.sin( x * 4.7 - t * 0.53 + phase * 1.7 ) * 0.3
        + Math.sin( x * 9.3 + t * 0.9 ) * 0.12;
}

RunLoop( ( dt, t ) =>
{
    const { ctx, width, height } = view;
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect( 0, 0, width, height );
    ctx.globalCompositeOperation = 'lighter';

    for ( const layer of layers )
    {
        const drift = t * layer.speed;
        for ( let x = 0; x < width; x += STEP )
        {
            const nx = x / width + drift;
            const w = Wave( nx, t, layer.phase );
            // the curtain's bottom edge waves; its height and brightness breathe
            const bottom = height * ( layer.base + w * 0.12 );
            const tall = height * ( 0.28 + 0.12 * Math.sin( nx * 3.3 + t * 0.2 + layer.phase ) );
            const light = 0.35 + 0.65 * Math.max( 0, Math.sin( nx * 6.0 - t * 0.4 + layer.phase ) * 0.5 + 0.5 );
            ctx.globalAlpha = layer.alpha * light;
            // exact, non-overlapping columns: overlaps add up as bright seams
            ctx.drawImage( layer.sprite, x, bottom - tall, STEP, tall );
        }
    }
    ctx.globalAlpha = 1;
} );
