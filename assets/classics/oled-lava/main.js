// Lava: big soft blobs of light drifting on slow orbits, glowing brighter
// where they meet, like a lava lamp seen in the dark.

const view = CreateCanvas();
const [ c1, c2 ] = Palette( '#ff3b3b', '#a64dff' );
window.ART_COLORS = [ c1, c2 ]; // for the optional clock overlay
const BLOBS = 7;
const blobs = [];

for ( let i = 0; i < BLOBS; i++ )
{
    blobs.push( {
        // centre of each orbit and its two frequencies (Lissajous paths)
        cx: Rand( 0.25, 0.75 ),
        cy: Rand( 0.3, 0.7 ),
        ax: Rand( 0.12, 0.3 ),
        ay: Rand( 0.12, 0.28 ),
        fx: Rand( 0.03, 0.07 ),
        fy: Rand( 0.025, 0.06 ),
        phase: Rand( 0, Math.PI * 2 ),
        size: Rand( 14, 24 ),
        color: Mix( c1, c2, i / ( BLOBS - 1 ) ),
    } );
}

RunLoop( ( dt, t ) =>
{
    const { ctx, width, height } = view;
    const u = Math.min( width, height ) / 100;
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect( 0, 0, width, height );
    ctx.globalCompositeOperation = 'lighter';

    for ( const b of blobs )
    {
        const x = ( b.cx + b.ax * Math.sin( t * b.fx * Math.PI * 2 + b.phase ) ) * width;
        const y = ( b.cy + b.ay * Math.sin( t * b.fy * Math.PI * 2 + b.phase * 1.3 ) ) * height;
        const r = u * b.size * ( 1 + 0.12 * Math.sin( t * 0.4 + b.phase ) );
        const glow = ctx.createRadialGradient( x, y, 0, x, y, r );
        glow.addColorStop( 0, Rgba( b.color, 0.5 ) );
        glow.addColorStop( 0.45, Rgba( b.color, 0.28 ) );
        glow.addColorStop( 1, Rgba( b.color, 0 ) );
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc( x, y, r, 0, Math.PI * 2 );
        ctx.fill();
    }
} );
