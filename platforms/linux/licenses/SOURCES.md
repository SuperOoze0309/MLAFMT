# AppImage runtime source and licenses

MLAFMT embeds the unmodified AppImage type-2 runtime, pinned by SHA256 in
`platforms/linux/appimage-tools.json`. Source and build instructions for that
runtime are available at this immutable revision:

- https://github.com/AppImage/type2-runtime/tree/8f39b89e2ac31e1640b3d3f7e9a5108e6ce805fa
- https://github.com/AppImage/type2-runtime/archive/8f39b89e2ac31e1640b3d3f7e9a5108e6ce805fa.tar.gz

The source contains the libfuse patch, runtime entry point and build scripts.
Its static dependencies are provided by Alpine Linux 3.21 and the upstream
source packages identified by the runtime build scripts. Upstream source:

- libfuse 3.15.0: https://github.com/libfuse/libfuse/releases/tag/fuse-3.15.0
- squashfuse 0.5.2: https://github.com/vasi/squashfuse/tree/0.5.2
- musl: https://git.musl-libc.org/cgit/musl/
- zstd: https://github.com/facebook/zstd
- zlib: https://github.com/madler/zlib
- mimalloc: https://github.com/microsoft/mimalloc
- Alpine source package recipes: https://gitlab.alpinelinux.org/alpine/aports/-/tree/3.21-stable

The accompanying files retain the MIT, BSD, zlib and GNU LGPL license notices
from those projects. AppImage's runtime is separate from MLAFMT's MIT-licensed
application. The portable `tar.gz` package can be used without the AppImage runtime.
