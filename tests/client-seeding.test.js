import MemoryChunkStore from 'memory-chunk-store';

import { defaultFile, defaultTorrentHash, defaultFileMagnetURI, defaultSeedingOptions } from './utils';
import WebTorrent, { ClientEvents, PaidStreamingExtensionNotices } from './../src/web3torrent-lib';

describe('Seeding and Leeching', () => {
  let seeder, leecher;

  beforeEach(() => {
    seeder = new WebTorrent({ pseAccount: 1, dht: false });
    seeder.on('error', err => fail(err));
    seeder.on('warning', err => fail(err));

    leecher = new WebTorrent({ pseAccount: 2, dht: false });
    leecher.on('error', err => fail(err));
    leecher.on('warning', err => fail(err));
  });

  it('should seed and remove a Torrent', done => {
    expect(seeder.pseAccount).toBe(1);
    seeder.seed(defaultFile, defaultSeedingOptions(false), seededTorrent => {
      expect(seeder.torrents.length).toEqual(1);
      expect(seededTorrent.infoHash).toEqual(defaultTorrentHash);
      expect(seededTorrent.magnetURI).toEqual(defaultFileMagnetURI);
      expect(seededTorrent.usingPaidStreaming).toBe(true);
      done();
    });
  });

  it('should perform the extended handshake between seeder and leecher', done => {
    seeder.seed(defaultFile, defaultSeedingOptions(), seededTorrent => {
      leecher.add(seededTorrent.magnetURI, { store: MemoryChunkStore }, () => {
        expect(leecher.torrents.length).toEqual(1);
        expect(seeder.torrents[0].wires.length).toEqual(1);
        expect(leecher.torrents[0].wires.length).toEqual(1);
        expect(leecher.torrents[0].wires.some(wire =>
          wire.paidStreamingExtension.peerAccount === seeder.pseAccount &&
          wire.paidStreamingExtension.pseAccount === leecher.pseAccount)).toBe(true)
        done();
      });
    });
  }, 10000);

  it('should reach a ready-for-leeching, choked state', done => {
    seeder.seed(defaultFile, defaultSeedingOptions(), seededTorrent => {
      seeder.once(ClientEvents.PEER_STATUS_CHANGED, ({ allowedPeers }) => {
        expect(allowedPeers[`${leecher.pseAccount}`].allowed).toEqual(false);
        done();
      });
      leecher.add(seededTorrent.magnetURI, { store: MemoryChunkStore });
    }
    );
  }, 10000);

  it('should be able to unchoke and finish a download', done => {
    seeder.seed(defaultFile, defaultSeedingOptions(), seededTorrent => {
      seeder.once(ClientEvents.PEER_STATUS_CHANGED, ({ peerAccount }) => {
        seeder.togglePeer(seededTorrent.infoHash, peerAccount);

        seeder.once(ClientEvents.PEER_STATUS_CHANGED, ({ allowedPeers }) => {
          expect(allowedPeers[`${leecher.pseAccount}`].allowed).toEqual(true);
        });

        seeder.once(ClientEvents.TORRENT_NOTICE, (_, __, command, ___) => {
          expect(command).toEqual(PaidStreamingExtensionNotices.ACK);

          leecher.once(ClientEvents.TORRENT_DONE, leechedTorrent => {
            expect(seededTorrent.files[0].done).toEqual(leechedTorrent.files[0].done);
            expect(seededTorrent.files[0].length).toEqual(leechedTorrent.files[0].length);
            expect(seededTorrent.files[0].name).toEqual(leechedTorrent.files[0].name);
            done();
          });
        });
      });

      leecher.add(seededTorrent.magnetURI, { store: MemoryChunkStore });
    }
    );
  }, 10000);

  afterEach(() => {
    seeder.destroy();
    leecher.destroy();
  });
});
