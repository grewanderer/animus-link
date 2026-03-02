use std::io;

pub trait TunDevice: Send {
    fn name(&self) -> &str;
    fn mtu(&self) -> u16;
    fn read_packet(&mut self, buf: &mut [u8]) -> io::Result<usize>;
    fn write_packet(&mut self, packet: &[u8]) -> io::Result<()>;
    fn try_clone_box(&self) -> io::Result<Box<dyn TunDevice>>;
}
