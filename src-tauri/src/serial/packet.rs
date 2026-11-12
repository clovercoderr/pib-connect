pub const HEADER: [u8; 2] = [0xFF, 0xFF];
pub const WRITE_DATA: u8 = 0x03;
pub const GOAL_POSITION_ADDR: u8 = 0x1E;

/// Builds a Dynamixel v1 goal position packet.
///
/// Packet: [0xFF, 0xFF, ID, LENGTH, 0x03, 0x1E, pos_low, pos_high, CHECKSUM]
/// Length = 5 (instruction + 3 params + checksum... actually: number_of_params + 2)
/// Checksum = ~(ID + Length + Instruction + Params) & 0xFF
pub fn build_goal_position_packet(motor_id: u8, position: u16) -> Vec<u8> {
    let position = position.min(1023);
    let pos_low = (position & 0xFF) as u8;
    let pos_high = ((position >> 8) & 0xFF) as u8;

    let params = [GOAL_POSITION_ADDR, pos_low, pos_high];
    let length: u8 = (params.len() as u8) + 2; // params.len() + instruction + checksum
    let checksum = calculate_checksum(motor_id, length, WRITE_DATA, &params);

    let mut packet = Vec::with_capacity(9);
    packet.extend_from_slice(&HEADER);
    packet.push(motor_id);
    packet.push(length);
    packet.push(WRITE_DATA);
    packet.extend_from_slice(&params);
    packet.push(checksum);

    packet
}

/// Calculates the Dynamixel v1 checksum.
/// checksum = ~(ID + Length + Instruction + Param1 + ... + ParamN) & 0xFF
pub fn calculate_checksum(motor_id: u8, length: u8, instruction: u8, params: &[u8]) -> u8 {
    let sum: u16 = motor_id as u16
        + length as u16
        + instruction as u16
        + params.iter().map(|&p| p as u16).sum::<u16>();
    (!(sum as u8)) as u8
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_packet_structure() {
        let packet = build_goal_position_packet(1, 512);
        assert_eq!(packet.len(), 9);
        assert_eq!(packet[0], 0xFF); // Header
        assert_eq!(packet[1], 0xFF); // Header
        assert_eq!(packet[2], 1);    // ID
        assert_eq!(packet[3], 5);    // Length
        assert_eq!(packet[4], 0x03); // WRITE_DATA instruction
        assert_eq!(packet[5], 0x1E); // Goal Position register
    }

    #[test]
    fn test_position_center() {
        // Motor 1, Position 512 (0x0200): low=0x00, high=0x02
        let packet = build_goal_position_packet(1, 512);
        assert_eq!(packet[6], 0x00); // pos low
        assert_eq!(packet[7], 0x02); // pos high
        // Checksum: ~(1 + 5 + 3 + 30 + 0 + 2) = ~41 = ~0x29 = 0xD6
        assert_eq!(packet[8], 0xD6);
    }

    #[test]
    fn test_position_min() {
        let packet = build_goal_position_packet(1, 0);
        assert_eq!(packet[6], 0x00); // pos low
        assert_eq!(packet[7], 0x00); // pos high
        // Checksum: ~(1 + 5 + 3 + 30 + 0 + 0) = ~39 = ~0x27 = 0xD8
        assert_eq!(packet[8], 0xD8);
    }

    #[test]
    fn test_position_max() {
        let packet = build_goal_position_packet(1, 1023);
        assert_eq!(packet[6], 0xFF); // 1023 & 0xFF = 255
        assert_eq!(packet[7], 0x03); // 1023 >> 8 = 3
    }

    #[test]
    fn test_position_clamping() {
        // Positions > 1023 should be clamped
        let packet = build_goal_position_packet(1, 2000);
        assert_eq!(packet[6], 0xFF); // clamped to 1023
        assert_eq!(packet[7], 0x03);
    }

    #[test]
    fn test_different_motor_ids() {
        for id in 1..=10u8 {
            let packet = build_goal_position_packet(id, 512);
            assert_eq!(packet[2], id);
            assert_eq!(packet.len(), 9);
        }
    }

    #[test]
    fn test_checksum_motor3_pos300() {
        // Motor 3, position 300 (0x012C): low=0x2C, high=0x01
        // sum = 3 + 5 + 3 + 30 + 44 + 1 = 86 = 0x56
        // checksum = ~86u8 = ~0x56 = 0xA9
        let packet = build_goal_position_packet(3, 300);
        assert_eq!(packet[6], 0x2C);
        assert_eq!(packet[7], 0x01);
        assert_eq!(packet[8], 0xA9);
    }

    #[test]
    fn test_packet_length_constant() {
        // Goal position packets are always 9 bytes
        for id in 1..=5u8 {
            for pos in [0u16, 100, 512, 1023] {
                let packet = build_goal_position_packet(id, pos);
                assert_eq!(packet.len(), 9);
            }
        }
    }
}
