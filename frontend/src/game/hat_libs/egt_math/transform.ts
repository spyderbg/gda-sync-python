// math::transformf (hat_libs/egt_math/transform.hpp, transform_t<float>): a position, a rotation and a scale, which a
// view pushes on its draw list (draw_list::push_transform) and tweens (tweeny_extend_transform).
//
// The browser's has those three components and their setters, getters and rotations; not the matrices, skew and
// perspective of C++ (the browser draws in 2D: DrawList applies the position, the z rotation and the x and y scale).

/** glm::vec3 */
export interface vec3 {
  x: number;
  y: number;
  z: number;
}

/** glm::vec3(v) or glm::vec3(x, y, z) */
export function vec3(x = 0, y = x, z = x): vec3 {
  return { x, y, z };
}

/** glm::quat (w, x, y, z) */
export interface quat {
  w: number;
  x: number;
  y: number;
  z: number;
}

/** glm::quat(euler): of pitch (x), yaw (y) and roll (z), in radians. */
export function quat_from_euler(euler: vec3): quat {
  const c = { x: Math.cos(euler.x * 0.5), y: Math.cos(euler.y * 0.5), z: Math.cos(euler.z * 0.5) };
  const s = { x: Math.sin(euler.x * 0.5), y: Math.sin(euler.y * 0.5), z: Math.sin(euler.z * 0.5) };
  return {
    w: c.x * c.y * c.z + s.x * s.y * s.z,
    x: s.x * c.y * c.z - c.x * s.y * s.z,
    y: c.x * s.y * c.z + s.x * c.y * s.z,
    z: c.x * c.y * s.z - s.x * s.y * c.z,
  };
}

/** glm's quaternion product p * q */
export function quat_mul(p: quat, q: quat): quat {
  return {
    w: p.w * q.w - p.x * q.x - p.y * q.y - p.z * q.z,
    x: p.w * q.x + p.x * q.w + p.y * q.z - p.z * q.y,
    y: p.w * q.y + p.y * q.w + p.z * q.x - p.x * q.z,
    z: p.w * q.z + p.z * q.w + p.x * q.y - p.y * q.x,
  };
}

function normalize(q: quat): quat {
  const length = Math.hypot(q.w, q.x, q.y, q.z);
  if (length <= 0) return { w: 1, x: 0, y: 0, z: 0 };
  return { w: q.w / length, x: q.x / length, y: q.y / length, z: q.z / length };
}

/** glm::eulerAngles: pitch (x), yaw (y) and roll (z), in radians. */
export function euler_angles(q: quat): vec3 {
  const pitch_y = 2 * (q.y * q.z + q.w * q.x);
  const pitch_x = q.w * q.w - q.x * q.x - q.y * q.y + q.z * q.z;
  const pitch = pitch_y === 0 && pitch_x === 0 ? 2 * Math.atan2(q.x, q.w) : Math.atan2(pitch_y, pitch_x);
  const yaw = Math.asin(Math.min(Math.max(-2 * (q.x * q.z - q.w * q.y), -1), 1));
  const roll_y = 2 * (q.x * q.y + q.w * q.z);
  const roll_x = q.w * q.w + q.x * q.x - q.y * q.y - q.z * q.z;
  const roll = roll_y === 0 && roll_x === 0 ? 0 : Math.atan2(roll_y, roll_x);
  return { x: pitch, y: yaw, z: roll };
}

export class transformf {
  readonly type_name = 'transformf';

  private position_ = vec3(0);
  private rotation_: quat = { w: 1, x: 0, y: 0, z: 0 };
  private scale_ = vec3(1);

  /** A new identity transform (C++ returns a reference to a constant one, which its users copy). */
  static identity() {
    return new transformf();
  }

  get_position(): vec3 {
    return { ...this.position_ };
  }

  /** set_position(position), or set_position(x, y, z = 0) */
  set_position(position: vec3 | number, y = 0, z = 0) {
    this.position_ = typeof position === 'number' ? vec3(position, y, z) : { ...position };
  }

  reset_position() {
    this.position_ = vec3(0);
  }

  get_rotation(): quat {
    return { ...this.rotation_ };
  }

  set_rotation(rotation: quat) {
    this.rotation_ = normalize(rotation);
  }

  reset_rotation() {
    this.rotation_ = { w: 1, x: 0, y: 0, z: 0 };
  }

  /** The rotation as Euler angles, in radians. */
  get_rotation_euler(): vec3 {
    return euler_angles(this.get_rotation());
  }

  get_rotation_euler_degrees(): vec3 {
    const angles = this.get_rotation_euler();
    return vec3((angles.x * 180) / Math.PI, (angles.y * 180) / Math.PI, (angles.z * 180) / Math.PI);
  }

  set_rotation_euler(euler_angles: vec3) {
    this.set_rotation(quat_from_euler(euler_angles));
  }

  set_rotation_euler_degrees(euler_angles: vec3) {
    this.set_rotation_euler(vec3((euler_angles.x * Math.PI) / 180, (euler_angles.y * Math.PI) / 180, (euler_angles.z * Math.PI) / 180));
  }

  get_scale(): vec3 {
    return { ...this.scale_ };
  }

  /** set_scale(scale), or set_scale(x, y, z = 1) */
  set_scale(scale: vec3 | number, y = 1, z = 1) {
    this.scale_ = typeof scale === 'number' ? vec3(scale, y, z) : { ...scale };
  }

  reset_scale() {
    this.scale_ = vec3(1);
  }

  /** Moves the position by v. */
  translate(v: vec3) {
    this.set_position(vec3(this.position_.x + v.x, this.position_.y + v.y, this.position_.z + v.z));
  }

  /** Rotates by Euler angles, in the parent's space. */
  rotate(v: vec3) {
    this.set_rotation(quat_mul(quat_from_euler(v), this.get_rotation()));
  }

  /** Rotates by Euler angles, in its own space. */
  rotate_local(v: vec3) {
    this.set_rotation(quat_mul(this.get_rotation(), quat_from_euler(v)));
  }

  /** Scales by v. */
  scale(v: vec3) {
    this.set_scale(vec3(this.scale_.x * v.x, this.scale_.y * v.y, this.scale_.z * v.z));
  }
}
