// Deck Animations player. Steam opens this page as a screensaver; config.js
// (written by the plugin) sets window.SCREENSAVER_CONFIG:
//   single:  { mode: 'single', videos: [ 'video.webm' ], fits: [ fit ], boomerang, plays }
//   shuffle: { mode: 'shuffle', items: [ { kind: 'video', src, fit, boomerang } | { kind: 'page', src } ],
//              boomerang (all videos), playsPerVideo, classicSeconds, stopAfterPass,
//              order: 'random' | 'sequence' (items already in the user's order) }
// In shuffle, videos/GIFs move on after playsPerVideo plays; classics have no
// end, so they move on after classicSeconds.
// fit: 'contain' | 'cover' | 'none' (fit, crop to fill, original size); plays: 0 = loop
// forever. 'page' items are generated classics, shown in a same-origin iframe.
// After `plays` plays the picture fades to black; the plugin may then also
// switch the backlight off.
//
// Boomerang: Chromium can't play video backwards, so during the first forward
// pass every presented frame is snapshotted to a JPEG blob; after that the
// clip alternates between the <video> going forward and the cached frames
// drawn in reverse on a <canvas>.

const CONFIG = Object.assign( { mode: 'single', videos: [ 'video.webm' ], boomerang: false, clipSeconds: 30 }, window.SCREENSAVER_CONFIG || {} );
const MAX_CAPTURE_FRAMES = 1800;   // ~60 s at 30 fps; longer clips just loop
const CAPTURE_MAX_WIDTH = 1280;
const JPEG_QUALITY = 0.85;
const DECODE_AHEAD = 8;
const FADE_MS = 1200;

function NextAnimationFrame()
{
    return new Promise( resolve => requestAnimationFrame( resolve ) );
}

class Clip
{
    constructor( root )
    {
        this.root = root;
        this.video = root.querySelector( 'video' );
        this.canvas = root.querySelector( 'canvas' );
        this.ctx = this.canvas.getContext( '2d' );
        this.frame = root.querySelector( 'iframe' );
        this.token = 0;
        this.pageTimer = null;
    }

    Stop()
    {
        this.token++;
        this.video.onended = this.video.onerror = this.video.onplaying = null;
        this.video.pause();
        this.video.removeAttribute( 'src' );
        this.video.load();
        clearTimeout( this.pageTimer );
        this.frame.onload = null;
        this.frame.src = 'about:blank';
        this.root.classList.remove( 'reverse', 'page' );
    }

    // Shows a generated classic for minMs, then calls onDone.
    StartPage( src, minMs, onShown, onDone )
    {
        this.Stop();
        const token = this.token;
        this.root.classList.add( 'page' );
        this.frame.onload = () =>
        {
            if ( token !== this.token )
                return;
            this.frame.onload = null;
            onShown && onShown();
            this.pageTimer = setTimeout( () => { if ( token === this.token ) onDone && onDone(); }, minMs );
        };
        this.frame.src = src;
    }

    // Plays src; once at least minMs have passed or maxCycles plays finished
    // (a boomerang play is forward + reverse), calls onDone.
    Start( src, boomerang, minMs, onShown, onDone, maxCycles = Infinity, fit = 'contain' )
    {
        this.Stop();
        // 'none' means original size; scale-down still shrinks anything bigger than the screen
        this.video.style.objectFit = this.canvas.style.objectFit = fit === 'none' ? 'scale-down' : fit;
        const token = this.token;
        const alive = () => token === this.token;
        const startedAt = performance.now();
        const video = this.video;
        let cycles = 0;
        const timeUp = () => cycles >= maxCycles || performance.now() - startedAt >= minMs;

        let canBoomerang = boomerang && 'requestVideoFrameCallback' in video;
        let capturing = canBoomerang;
        let frames = [];

        const capCanvas = document.createElement( 'canvas' );
        const capCtx = capCanvas.getContext( '2d' );

        const OnFrame = ( now, meta ) =>
        {
            if ( !alive() || !capturing )
                return;

            if ( frames.length >= MAX_CAPTURE_FRAMES )
            {
                // too long to cache: give up on boomerang for this clip
                capturing = canBoomerang = false;
                frames = [];
                return;
            }

            const width = Math.min( video.videoWidth, CAPTURE_MAX_WIDTH );
            const height = Math.round( video.videoHeight * width / video.videoWidth );
            if ( capCanvas.width !== width || capCanvas.height !== height )
            {
                capCanvas.width = width;
                capCanvas.height = height;
            }
            capCtx.drawImage( video, 0, 0, width, height );

            const slot = { blob: null, time: meta.mediaTime };
            frames.push( slot );
            capCanvas.toBlob( blob => { slot.blob = blob; }, 'image/jpeg', JPEG_QUALITY );

            video.requestVideoFrameCallback( OnFrame );
        };

        const PlayForward = () =>
        {
            video.currentTime = 0;
            // keep the canvas (showing frame 0) up until the seek lands, so the
            // stale last frame of the video never flashes
            video.addEventListener( 'seeked', () =>
            {
                if ( !alive() )
                    return;
                this.root.classList.remove( 'reverse' );
                video.play().catch( () => {} );
            }, { once: true } );
        };

        const PlayReverse = async () =>
        {
            const ready = frames.filter( f => f.blob );
            if ( ready.length < 2 )
                return;

            this.canvas.width = capCanvas.width;
            this.canvas.height = capCanvas.height;

            const queue = [];
            let next = ready.length - 1;
            const Fill = () =>
            {
                while ( queue.length < DECODE_AHEAD && next >= 0 )
                    queue.push( createImageBitmap( ready[ next-- ].blob ) );
            };
            Fill();

            const lastTime = ready[ ready.length - 1 ].time;
            const t0 = performance.now();

            for ( let k = ready.length - 1; k >= 0; k-- )
            {
                const bitmap = await queue.shift();
                Fill();
                if ( !alive() )
                {
                    bitmap.close();
                    return;
                }

                const due = t0 + ( lastTime - ready[ k ].time ) * 1000;
                while ( performance.now() < due - 4 )
                    await NextAnimationFrame();

                this.ctx.drawImage( bitmap, 0, 0 );
                bitmap.close();
                if ( k === ready.length - 1 )
                    this.root.classList.add( 'reverse' );
            }
        };

        video.onplaying = () =>
        {
            video.onplaying = null;
            onShown && onShown();
        };

        video.onerror = () =>
        {
            if ( alive() )
                onDone && onDone();
        };

        video.onended = async () =>
        {
            if ( !alive() )
                return;

            if ( capturing )
                capturing = false;

            if ( canBoomerang && frames.length > 1 )
            {
                await PlayReverse();
                if ( !alive() )
                    return;
            }

            cycles++;
            if ( timeUp() && onDone )
                onDone();
            else
                PlayForward();
        };

        video.src = src;
        if ( canBoomerang )
            video.requestVideoFrameCallback( OnFrame );
        video.play().catch( () => {} );
    }
}

function Shuffled( list, avoidFirst )
{
    const out = list.slice();
    for ( let i = out.length - 1; i > 0; i-- )
    {
        const j = Math.floor( Math.random() * ( i + 1 ) );
        [ out[ i ], out[ j ] ] = [ out[ j ], out[ i ] ];
    }
    // pop() takes from the end; avoid replaying the clip that just finished
    if ( out.length > 1 && out[ out.length - 1 ] === avoidFirst )
        [ out[ 0 ], out[ out.length - 1 ] ] = [ out[ out.length - 1 ], out[ 0 ] ];
    return out;
}

function Init()
{
    const fits = CONFIG.fits || [];
    const items = CONFIG.items || ( CONFIG.videos || [] ).map( ( src, i ) => ( { kind: 'video', src, fit: fits[ i ] } ) );
    if ( items.length === 0 )
        return;

    const clips = [ new Clip( document.getElementById( 'a' ) ), new Clip( document.getElementById( 'b' ) ) ];

    const shuffle = CONFIG.mode === 'shuffle';
    const stopAfterPass = shuffle && !!CONFIG.stopAfterPass;
    const classicMs = Math.max( 1, CONFIG.classicSeconds || CONFIG.clipSeconds || 60 ) * 1000;
    // the end: fade to black and stop decoding (the plugin may then turn the display off)
    const FadeOut = () =>
    {
        clips.forEach( c => c.root.classList.remove( 'visible' ) );
        setTimeout( () => clips.forEach( c => c.Stop() ), FADE_MS );
    };

    if ( !shuffle || items.length === 1 )
    {
        const item = items[ 0 ];
        const clip = clips[ 0 ];
        const shown = () => clip.root.classList.add( 'visible' );
        if ( item.kind === 'page' )
        {
            clip.StartPage( item.src, stopAfterPass ? classicMs : Infinity, shown, stopAfterPass ? FadeOut : null );
            return;
        }
        const plays = shuffle ? ( stopAfterPass ? Math.max( 1, CONFIG.playsPerVideo || 1 ) : 0 ) : CONFIG.plays || 0;
        clip.Start( item.src, CONFIG.boomerang || !!item.boomerang, Infinity, shown,
            plays > 0 ? FadeOut : null, plays > 0 ? plays : Infinity, item.fit || 'contain' );
        return;
    }

    const plays = Math.max( 1, CONFIG.playsPerVideo || 1 );
    // pop() takes from the end, so a sequence is queued reversed
    const NextRound = () => ( CONFIG.order === 'sequence' ? items.slice().reverse() : Shuffled( items, last ) );
    let last = null;
    let order = NextRound();
    let current = 0;

    const PlayNext = () =>
    {
        if ( order.length === 0 )
        {
            if ( stopAfterPass )
            {
                FadeOut();
                return;
            }
            order = NextRound();
        }
        last = order.pop();

        const clip = clips[ current ];
        const previous = clips[ 1 - current ];
        current = 1 - current;

        const shown = () =>
        {
            clip.root.classList.add( 'visible' );
            previous.root.classList.remove( 'visible' );
            setTimeout( () => { if ( !previous.root.classList.contains( 'visible' ) ) previous.Stop(); }, FADE_MS );
        };
        if ( last.kind === 'page' )
            clip.StartPage( last.src, classicMs, shown, PlayNext );
        else
            clip.Start( last.src, CONFIG.boomerang || !!last.boomerang, Infinity, shown, PlayNext, plays, last.fit || 'contain' );
    };

    PlayNext();
}

Init();
