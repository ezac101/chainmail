// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @title ChainMail
 * @dev Immutable email system on BlockDAG
 * All emails are stored permanently and cannot be deleted
 */
contract ChainMail {
    struct Email {
        address sender;
        address recipient;
        string ipfsHash;      // CID of encrypted email on IPFS
        uint256 timestamp;
        bool isImmutable;     // Always true, enforced on-chain
    }

    // Mapping from email ID to Email struct
    mapping(uint256 => Email) public emails;
    
    // Counter for email IDs
    uint256 public emailCount;
    
    // Mapping from recipient address to array of email IDs
    mapping(address => uint256[]) public recipientEmails;
    
    // Mapping from sender address to array of email IDs
    mapping(address => uint256[]) public senderEmails;
    
    // Mapping from wallet address to PGP public key
    mapping(address => string) public publicKeys;

    // Contract owner and authorized relay address
    address public owner;
    address public relayAddress;

    // Events
    event EmailSent(
        uint256 indexed emailId,
        address indexed sender,
        address indexed recipient,
        string ipfsHash,
        uint256 timestamp
    );
    
    event PublicKeyRegistered(
        address indexed user,
        string publicKey,
        uint256 timestamp
    );

    modifier onlyOwner() {
        require(msg.sender == owner, "Not contract owner");
        _;
    }

    modifier onlyRelay() {
        require(msg.sender == relayAddress, "Not authorized relay");
        _;
    }

    constructor(address _relayAddress) {
        owner = msg.sender;
        relayAddress = _relayAddress;
    }

    function setRelayAddress(address _relayAddress) external onlyOwner {
        require(_relayAddress != address(0), "Invalid relay address");
        relayAddress = _relayAddress;
    }

    function transferOwnership(address _newOwner) external onlyOwner {
        require(_newOwner != address(0), "Invalid owner address");
        owner = _newOwner;
    }

    function _logEmail(
        address _sender,
        address _recipient,
        string memory _ipfsHash
    ) internal returns (uint256) {
        require(_sender != address(0), "Invalid sender address");
        require(_recipient != address(0), "Invalid recipient address");
        require(bytes(_ipfsHash).length > 0, "IPFS hash cannot be empty");

        emailCount++;
        uint256 emailId = emailCount;

        emails[emailId] = Email({
            sender: _sender,
            recipient: _recipient,
            ipfsHash: _ipfsHash,
            timestamp: block.timestamp,
            isImmutable: true
        });

        recipientEmails[_recipient].push(emailId);
        senderEmails[_sender].push(emailId);

        emit EmailSent(emailId, _sender, _recipient, _ipfsHash, block.timestamp);

        return emailId;
    }

    /**
     * @dev Log a sent email on-chain (immutable)
     * @param _recipient The recipient's wallet address
     * @param _ipfsHash The IPFS CID of the encrypted email
     */
    function logSend(address _recipient, string memory _ipfsHash) public returns (uint256) {
        return _logEmail(msg.sender, _recipient, _ipfsHash);
    }

    function logSendFor(
        address _sender,
        address _recipient,
        string memory _ipfsHash
    ) public onlyRelay returns (uint256) {
        return _logEmail(_sender, _recipient, _ipfsHash);
    }

    /**
     * @dev Get emails received by an address
     * @param _recipient The recipient's wallet address
     * @return Array of email IDs
     */
    function getRecipientEmails(address _recipient) public view returns (uint256[] memory) {
        return recipientEmails[_recipient];
    }

    /**
     * @dev Get emails sent by an address
     * @param _sender The sender's wallet address
     * @return Array of email IDs
     */
    function getSenderEmails(address _sender) public view returns (uint256[] memory) {
        return senderEmails[_sender];
    }

    /**
     * @dev Get email details by ID
     * @param _emailId The email ID
     * @return Email struct
     */
    function getEmail(uint256 _emailId) public view returns (
        address sender,
        address recipient,
        string memory ipfsHash,
        uint256 timestamp,
        bool isImmutable
    ) {
        require(_emailId > 0 && _emailId <= emailCount, "Invalid email ID");
        Email memory email = emails[_emailId];
        return (
            email.sender,
            email.recipient,
            email.ipfsHash,
            email.timestamp,
            email.isImmutable
        );
    }

    /**
     * @dev Register or update user's PGP public key
     * @param _publicKey The user's PGP public key (armored)
     */
    function registerPublicKey(string memory _publicKey) public {
        _setPublicKey(msg.sender, _publicKey);
    }

    function registerPublicKeyFor(address _user, string memory _publicKey) public onlyRelay {
        _setPublicKey(_user, _publicKey);
    }

    function _setPublicKey(address _user, string memory _publicKey) internal {
        require(_user != address(0), "Invalid user address");
        require(bytes(_publicKey).length > 0, "Public key cannot be empty");
        publicKeys[_user] = _publicKey;
        emit PublicKeyRegistered(_user, _publicKey, block.timestamp);
    }

    /**
     * @dev Get a user's PGP public key
     * @param _user The user's wallet address
     * @return The user's PGP public key
     */
    function getPublicKey(address _user) public view returns (string memory) {
        return publicKeys[_user];
    }

    /**
     * @dev Get total number of emails
     * @return Total email count
     */
    function getTotalEmails() public view returns (uint256) {
        return emailCount;
    }
}
